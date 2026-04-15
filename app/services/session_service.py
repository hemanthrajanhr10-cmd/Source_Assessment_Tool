"""
Session service: orchestrates multi-server, multi-database assessment sessions.

Responsibilities:
  - TCP connectivity test (detect on-prem vs cloud)
  - Database listing (SELECT from sys.databases)
  - Session background runner: spawns parallel jobs for each server+database
  - Session progress updater: atomically reflects child job states back onto session
"""

import json
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from app.core import job_store
from app.core.logging import get_logger
from app.db import azure_store, service_bus
from app.models.job import JobRecord
from app.models.requests import DatabaseTarget, ServerTarget, SessionRequest
from app.models.responses import JobStatus

logger = get_logger(__name__)


# ── Connectivity test ──────────────────────────────────────────────────────────

def test_connectivity(server: str, port: int, timeout: float = 3.0) -> tuple[bool, Optional[float]]:
    """
    TCP connect test.  Returns (reachable, latency_ms or None).
    On-prem servers behind a firewall will time out → reachable=False.
    """
    try:
        start = time.monotonic()
        sock = socket.create_connection((server, port), timeout=timeout)
        latency = (time.monotonic() - start) * 1000
        sock.close()
        return True, round(latency, 1)
    except Exception:
        return False, None


# ── Database listing ───────────────────────────────────────────────────────────

_LIST_DB_QUERIES = {
    "mssql": """
        SELECT name, state_desc, NULL AS size_mb
        FROM sys.databases
        WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
          AND state = 0
        ORDER BY name
    """,
    "postgres": """
        SELECT datname AS name, 'ONLINE' AS state_desc,
               pg_database_size(datname) / (1024*1024.0) AS size_mb
        FROM pg_database
        WHERE datistemplate = false
          AND datname NOT IN ('postgres')
        ORDER BY datname
    """,
    "mysql": """
        SELECT schema_name AS name, 'ONLINE' AS state_desc, NULL AS size_mb
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys')
        ORDER BY schema_name
    """,
}


def list_databases(connection_params) -> list[dict]:
    """
    Return user databases for the given connection (excludes system databases).
    Supports mssql, postgres, and mysql.
    """
    from app.db import connector

    db_type = getattr(connection_params, "db_type", "mssql")
    sql = _LIST_DB_QUERIES.get(db_type, _LIST_DB_QUERIES["mssql"])

    conn = connector.get_connection(connection_params)
    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        cols = [desc[0] for desc in cursor.description]
        rows = []
        for row in cursor.fetchall():
            d = dict(zip(cols, row))
            for k, v in d.items():
                if isinstance(v, Decimal):
                    d[k] = float(v)
            rows.append(d)
        return rows
    finally:
        conn.close()


# ── Gateway helpers ────────────────────────────────────────────────────────────

def get_online_gateway() -> Optional[str]:
    """Return the gateway_key of the first online gateway, or None."""
    gateways = azure_store.list_gateways()
    for gw in gateways:
        if gw.get("status") == "online":
            return gw["gateway_key"]
    return None


# ── Session progress ───────────────────────────────────────────────────────────

def update_session_progress(session_id: str) -> None:
    """
    Atomically recompute session status/counters from child job states.
    Safe to call from multiple concurrent threads.
    """
    try:
        azure_store.recompute_session_status(session_id)
    except Exception as exc:
        logger.warning("Could not update session %s progress: %s", session_id, exc)


# ── Single-job runners ─────────────────────────────────────────────────────────

def _run_direct_job(session_id: str, job_id: str, srv: ServerTarget, db: DatabaseTarget) -> None:
    """Run a single direct-connection job (blocking). Updates session on completion."""
    from app.models.requests import AssessmentRequest, ConnectionParams
    from app.models.responses import humanize_connection_error
    from app.services.assessment_service import run_assessment

    request = AssessmentRequest(
        connection=ConnectionParams(
            db_type=srv.db_type,
            server=srv.server,
            port=srv.port,
            database=db.name,
            username=srv.username,
            password=srv.password,
            trust_server_certificate=srv.trust_server_certificate,
            encrypt=srv.encrypt,
        ),
        include_null_analysis=db.include_null_analysis,
        null_analysis_sample_limit=db.null_analysis_sample_limit,
        label=f"{srv.server}/{db.name}",
    )

    job_store.update_job(job_id, status=JobStatus.RUNNING, started_at=datetime.now(timezone.utc))
    try:
        results, report_path = run_assessment(job_id, request)
        job_store.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
            results=results,
            report_path=report_path,
            progress_message="Assessment complete.",
        )
        logger.info("Session %s job %s completed", session_id, job_id)
    except Exception as exc:
        logger.error("Session %s job %s failed: %s", session_id, job_id, exc, exc_info=True)
        friendly = humanize_connection_error(exc, server=srv.server, database=db.name)
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=friendly,
            progress_message=None,
        )
    finally:
        update_session_progress(session_id)


def _queue_gateway_job(session_id: str, job_id: str, srv: ServerTarget, db: DatabaseTarget) -> None:
    """Publish a job to the gateway agent (non-blocking — gateway runs it async)."""
    payload = {
        "connection": {
            "server": srv.server,
            "port": srv.port,
            "database": db.name,
            "username": srv.username,
            "password": srv.password.get_secret_value(),
            "trust_server_certificate": srv.trust_server_certificate,
            "encrypt": srv.encrypt,
        },
        "include_null_analysis": db.include_null_analysis,
        "null_analysis_sample_limit": db.null_analysis_sample_limit,
    }

    if service_bus.is_available():
        job_store.update_job(job_id, progress_message="Waiting for gateway agent to pick up job…")
        service_bus.publish_job(job_id, payload)
        logger.info("Session %s job %s published to Service Bus", session_id, job_id)
    else:
        # HTTP polling fallback — use the specified gateway key
        gw_key = srv.gateway_key
        if gw_key:
            azure_store.update_job(
                job_id,
                gateway_key=gw_key,
                gateway_payload=json.dumps(payload),
            )
            job_store.update_job(job_id, progress_message="Queued for gateway (HTTP polling)…")
            logger.info("Session %s job %s queued for gateway %s (HTTP)", session_id, job_id, gw_key[:8])
        else:
            job_store.update_job(
                job_id,
                status=JobStatus.FAILED,
                completed_at=datetime.now(timezone.utc),
                error="No gateway selected. Choose a gateway agent for this server.",
            )
            update_session_progress(session_id)


# ── Session orchestrator ───────────────────────────────────────────────────────

def run_session_background(session_id: str, request: SessionRequest, user_id: str | None = None) -> None:
    """
    Background task: create child jobs for all server+database pairs and run them.
    - Gateway jobs: published immediately (non-blocking), session progress updated by result_handler
    - Direct jobs: run in a thread pool (blocking per-job), session progress updated inline
    """
    jobs_info: list[tuple[str, ServerTarget, DatabaseTarget]] = []

    for srv in request.servers:
        for db in srv.databases:
            job_id = str(uuid.uuid4())
            record = JobRecord(
                job_id=job_id,
                label=f"{srv.server}/{db.name}",
                session_id=session_id,
                server_name=srv.server,
                database_name=db.name,
            )
            job_store.create_job(record, user_id=user_id)
            jobs_info.append((job_id, srv, db))

    if not jobs_info:
        azure_store.update_session(
            session_id,
            status="completed",
            total_jobs=0,
            completed_at=datetime.now(timezone.utc),
        )
        return

    azure_store.update_session(session_id, total_jobs=len(jobs_info), status="running")

    gateway_jobs = [(jid, srv, db) for jid, srv, db in jobs_info if srv.use_gateway]
    direct_jobs  = [(jid, srv, db) for jid, srv, db in jobs_info if not srv.use_gateway]

    # Publish gateway jobs immediately (non-blocking)
    for jid, srv, db in gateway_jobs:
        _queue_gateway_job(session_id, jid, srv, db)

    # Run direct jobs in parallel (blocking until all complete)
    if direct_jobs:
        max_workers = min(len(direct_jobs), 5)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_run_direct_job, session_id, jid, srv, db): jid
                for jid, srv, db in direct_jobs
            }
            for future in as_completed(futures):
                jid = futures[future]
                try:
                    future.result()
                except Exception as exc:
                    logger.error("Unhandled error in session %s job %s: %s", session_id, jid, exc)

    # If no gateway jobs pending, force a final progress recompute
    if not gateway_jobs:
        update_session_progress(session_id)
