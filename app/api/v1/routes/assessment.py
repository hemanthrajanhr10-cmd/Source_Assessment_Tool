"""
Assessment API routes.

POST   /api/v1/assess               — trigger a new assessment job (202 Accepted)
GET    /api/v1/jobs                 — list all jobs
GET    /api/v1/jobs/{job_id}/status — poll job status + progress
GET    /api/v1/jobs/{job_id}/results — fetch full JSON results (completed jobs only)
GET    /api/v1/jobs/{job_id}/report  — download Excel report (completed jobs only)
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, Response

from app.core import job_store
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store, connector, service_bus
from app.models.job import JobRecord
from app.models.requests import AssessmentRequest
from app.models.responses import (
    AssessmentResponse,
    AssessmentResults,
    ConnectionTestResponse,
    JobStatus,
    JobStatusResponse,
    OverviewResult,
    humanize_connection_error,
)
from app.services import assessment_service

router = APIRouter()
logger = get_logger(__name__)

EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ─────────────────────── Background task bridge ─────────────────────────────

def _run_assessment_task(job_id: str, request: AssessmentRequest) -> None:
    """
    Executed in FastAPI's default thread-pool executor (not the event loop).
    Updates job state before, during, and after the assessment run.
    """
    job_store.update_job(
        job_id,
        status=JobStatus.RUNNING,
        started_at=datetime.now(timezone.utc),
    )
    try:
        results, report_path = assessment_service.run_assessment(job_id, request)
        job_store.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
            results=results,
            report_path=report_path,
            progress_message="Assessment complete.",
        )
        logger.info("Job %s completed", job_id, extra={"job_id": job_id})
    except Exception as exc:
        logger.error(
            "Job %s failed: %s", job_id, exc,
            extra={"job_id": job_id}, exc_info=True,
        )
        friendly = humanize_connection_error(
            exc,
            server=request.connection.server,
            database=request.connection.database,
        )
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=friendly,
            progress_message=None,
        )


# ──────────────────────────── Endpoints ─────────────────────────────────────

@router.post(
    "/test-connection",
    response_model=ConnectionTestResponse,
    summary="Test SQL Server connectivity",
    description=(
        "Attempts to open a connection and run a trivial query. "
        "Always returns 200; check the `success` field to determine the result."
    ),
)
async def test_connection(body: AssessmentRequest) -> ConnectionTestResponse:
    try:
        conn = connector.get_connection(body.connection)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        return ConnectionTestResponse(
            success=True,
            message=f"Successfully connected to '{body.connection.database}' on '{body.connection.server}'.",
        )
    except Exception as exc:
        friendly = humanize_connection_error(
            exc,
            server=body.connection.server,
            database=body.connection.database,
        )
        logger.warning("Connection test failed: %s", exc)
        return ConnectionTestResponse(success=False, message=friendly)


@router.post(
    "/assess",
    response_model=AssessmentResponse,
    status_code=202,
    summary="Trigger a new SQL Server assessment",
    description=(
        "Accepts SQL Server connection credentials and assessment options. "
        "Returns a job ID immediately. Poll `/jobs/{job_id}/status` to track progress."
    ),
)
async def trigger_assessment(
    body: AssessmentRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
) -> AssessmentResponse:
    job_id = str(uuid.uuid4())
    user_id = current_user["user_id"]

    # ── Gateway path: publish to Relay / Service Bus / HTTP poll ─────────────
    if body.gateway_key:
        # FIX: db_type was previously omitted from the connection payload, causing
        # the gateway agent to always fall back to its default (mssql/pymssql) even
        # when the assessment context is Oracle. It must be forwarded explicitly so
        # the agent can select the correct driver and query set.
        payload = {
            "connection": {
                "db_type":                  body.connection.db_type,
                "server":                   body.connection.server,
                "port":                     body.connection.port,
                "database":                 body.connection.database,
                "username":                 body.connection.username,
                "password":                 body.connection.password.get_secret_value(),
                "trust_server_certificate": body.connection.trust_server_certificate,
                "encrypt":                  body.connection.encrypt,
            },
            "include_null_analysis":      body.include_null_analysis,
            "null_analysis_sample_limit": body.null_analysis_sample_limit,
        }
        record = JobRecord(job_id=job_id, label=body.label)

        # Check if this gateway has Azure Relay configured
        gw = azure_store.get_gateway(body.gateway_key)
        relay_conn_str = (gw or {}).get("relay_connection_string") or ""

        if relay_conn_str:
            # ── Azure Relay Hybrid Connection path (VPN-proof, real-time) ────
            from app.services import relay_service
            job_store.create_job(record, user_id=user_id)
            job_store.update_job(
                job_id,
                status=JobStatus.PENDING,
                progress_message="Dispatching to gateway agent via Azure Relay…",
            )
            try:
                await relay_service.send_job(relay_conn_str, job_id, payload)
            except RuntimeError as exc:
                job_store.update_job(
                    job_id,
                    status=JobStatus.FAILED,
                    completed_at=datetime.now(timezone.utc),
                    error=str(exc),
                    progress_message=None,
                )
                raise HTTPException(status_code=503, detail=str(exc))
            logger.info("Job %s dispatched via Azure Relay to gateway %s", job_id, body.gateway_key[:8], extra={"job_id": job_id})
            return AssessmentResponse(
                job_id=job_id,
                status=JobStatus.PENDING,
                message="Job sent to gateway agent via Azure Relay.",
            )

        elif service_bus.is_available():
            # ── Service Bus path — VPN-proof, agent receives via queue ────────
            job_store.create_job(record, user_id=user_id)
            job_store.update_job(job_id, progress_message="Waiting for gateway agent to pick up job…")
            service_bus.publish_job(job_id, payload)
            logger.info("Job %s published to Service Bus", job_id, extra={"job_id": job_id})
            return AssessmentResponse(
                job_id=job_id,
                status=JobStatus.PENDING,
                message="Job sent to Service Bus. Agent will pick it up shortly.",
            )

        else:
            # ── Fallback: legacy HTTP polling ─────────────────────────────────
            azure_store.create_gateway_job(
                job_id=job_id,
                label=body.label,
                created_at=record.created_at,
                gateway_key=body.gateway_key,
                gateway_payload=json.dumps(payload),
                user_id=user_id,
            )
            logger.info("Job %s queued (HTTP poll fallback) for gateway %s", job_id, body.gateway_key[:8], extra={"job_id": job_id})
            return AssessmentResponse(
                job_id=job_id,
                status=JobStatus.PENDING,
                message="Job queued for gateway agent (HTTP polling mode).",
            )

    # ── Direct path: run in background ───────────────────────────────────────
    record = JobRecord(job_id=job_id, label=body.label)
    job_store.create_job(record, user_id=user_id)
    background_tasks.add_task(_run_assessment_task, job_id, body)

    logger.info("Assessment job %s queued", job_id, extra={"job_id": job_id})
    return AssessmentResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Assessment queued. Poll /jobs/{job_id}/status for updates.",
    )


@router.get(
    "/jobs",
    response_model=list[JobStatusResponse],
    summary="List all assessment jobs",
)
async def list_jobs(current_user: dict = Depends(get_current_user)) -> list[JobStatusResponse]:
    records = job_store.list_jobs(user_id=current_user["user_id"])
    return [_to_status_response(r) for r in records]


@router.get(
    "/jobs/{job_id}/status",
    response_model=JobStatusResponse,
    summary="Get job status and progress",
)
async def get_job_status(job_id: str, current_user: dict = Depends(get_current_user)) -> JobStatusResponse:
    record = job_store.get_job(job_id)
    if record is None or (record.user_id and record.user_id != current_user["user_id"]):
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _to_status_response(record)


@router.get(
    "/jobs/{job_id}/results",
    response_model=AssessmentResults,
    summary="Get full JSON results of a completed assessment",
)
async def get_results(job_id: str, current_user: dict = Depends(get_current_user)) -> AssessmentResults:
    record = _require_completed(job_id, current_user["user_id"])

    raw = azure_store.load_full_results(job_id)
    overview_raw = raw.get("overview")
    overview: OverviewResult | None = None
    if isinstance(overview_raw, dict):
        try:
            overview = OverviewResult(**overview_raw)
        except Exception:
            overview = None

    return AssessmentResults(
        job_id=job_id,
        overview=overview,
        access_level=raw.get("access_level"),
        # Core metadata
        schemas=raw.get("schemas", []),
        tables=raw.get("tables", []),
        columns=raw.get("columns", []),
        views=raw.get("views", []),
        stored_procedures=raw.get("stored_procedures", []),
        functions=raw.get("functions", []),
        indexes=raw.get("indexes", []),
        relationships=raw.get("relationships", []),
        index_coverage=raw.get("index_coverage", []),
        insertion_frequency=raw.get("insertion_frequency", []),
        null_analysis=raw.get("null_analysis", []),
        # Security assessment
        db_users_roles=raw.get("db_users_roles", []),
        orphaned_users=raw.get("orphaned_users", []),
        db_owner_members=raw.get("db_owner_members", []),
        dynamic_sql_usage=raw.get("dynamic_sql_usage", []),
        clr_assemblies=raw.get("clr_assemblies", []),
        tde_status=raw.get("tde_status", []),
        column_encryption=raw.get("column_encryption", []),
        pii_indicators=raw.get("pii_indicators", []),
        # Feature usage & risks
        sql_agent_jobs=raw.get("sql_agent_jobs", []),
        linked_servers=raw.get("linked_servers", []),
        cross_db_references=raw.get("cross_db_references", []),
        replication_status=raw.get("replication_status", []),
        service_broker=raw.get("service_broker", []),
        version_features=raw.get("version_features", []),
        # Schema / Design checks
        trustworthy_databases=raw.get("trustworthy_databases", []),
        deprecated_data_types=raw.get("deprecated_data_types", []),
        missing_primary_keys=raw.get("missing_primary_keys", []),
        heap_tables=raw.get("heap_tables", []),
        untrusted_constraints=raw.get("untrusted_constraints", []),
        sp_naming_violations=raw.get("sp_naming_violations", []),
        duplicate_indexes=raw.get("duplicate_indexes", []),
        database_options_audit=raw.get("database_options_audit", []),
        object_permissions=raw.get("object_permissions", []),
        # Performance checks
        missing_indexes=raw.get("missing_indexes", []),
        index_usage_stats=raw.get("index_usage_stats", []),
        fragmentation_report=raw.get("fragmentation_report", []),
        statistics_health=raw.get("statistics_health", []),
        # Reliability / Config checks
        backup_history=raw.get("backup_history", []),
        server_configurations=raw.get("server_configurations", []),
        weak_sql_logins=raw.get("weak_sql_logins", []),
        server_permissions=raw.get("server_permissions", []),
        deprecated_features_in_use=raw.get("deprecated_features_in_use", []),
    )


@router.get(
    "/jobs/{job_id}/report",
    summary="Download the Excel assessment report",
)
async def download_report(job_id: str, current_user: dict = Depends(get_current_user)):
    from fastapi.responses import Response
    _require_completed(job_id, current_user["user_id"])

    filename = f"sql_assessment_{job_id[:8]}.xlsx"

    # Fast path: serve cached bytes directly from DB (no rebuild needed).
    # Bytes are stored by build_report() when the assessment completes.
    cached = azure_store.load_excel_bytes(job_id)
    if cached:
        return Response(
            content=cached,
            media_type=EXCEL_MEDIA_TYPE,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Fallback: regenerate for legacy jobs that pre-date the cache column.
    # This path is slow and may hit the 230s App Service timeout for large reports.
    from app.services.report_service import build_report
    raw = azure_store.load_full_results(job_id)
    report_path = build_report(job_id, raw)

    return FileResponse(
        path=report_path,
        media_type=EXCEL_MEDIA_TYPE,
        filename=filename,
    )


WORD_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get(
    "/jobs/{job_id}/word-report",
    summary="Download the Word (.docx) Fabric Assessment Report",
)
async def download_word_report(job_id: str, current_user: dict = Depends(get_current_user)) -> Response:
    record = _require_completed(job_id, current_user["user_id"])

    from app.services.word_report_service import build_word_report
    raw = azure_store.load_full_results(job_id)
    # Use job label as client name (falls back to database name inside the builder)
    doc_bytes = build_word_report(job_id, raw, client_name=record.label or None)

    filename = f"fabric_assessment_{job_id[:8]}.docx"
    return Response(
        content=doc_bytes,
        media_type=WORD_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ──────────────────────────── Helpers ───────────────────────────────────────

def _to_status_response(record: JobRecord) -> JobStatusResponse:
    return JobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        label=record.label,
        created_at=record.created_at,
        started_at=record.started_at,
        completed_at=record.completed_at,
        error=record.error,
        progress_message=record.progress_message,
    )


def _require_completed(job_id: str, user_id: str | None = None) -> JobRecord:
    record = job_store.get_job(job_id)
    if record is None or (user_id and record.user_id and record.user_id != user_id):
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if record.status == JobStatus.PENDING:
        raise HTTPException(status_code=409, detail="Assessment is still pending.")
    if record.status == JobStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Assessment is still running.")
    if record.status == JobStatus.FAILED:
        raise HTTPException(
            status_code=422,
            detail=f"Assessment failed: {record.error}",
        )
    return record
