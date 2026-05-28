"""
Gateway API routes — enables the SAT Windows agent to run assessments
inside a client's private network and submit results to the cloud.

POST /api/v1/gateway/register        — register a gateway, get a key
GET  /api/v1/gateway/list            — list all gateways
GET  /api/v1/gateway/status          — check one gateway (by key)
GET  /api/v1/gateway/poll            — agent polls for pending jobs
POST /api/v1/gateway/submit/{job_id} — agent submits completed results
GET  /api/v1/gateway/download        — download the agent script
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core import job_store
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.models.responses import JobStatus
from app.services import report_service
from app.services.assessment_service import _extract_overview

router = APIRouter()
logger = get_logger(__name__)


# ── Request / Response models ─────────────────────────────────────────────────

class GatewayRegisterRequest(BaseModel):
    name: str


class GatewayRegisterResponse(BaseModel):
    gateway_key: str
    name: str
    message: str


class GatewayPollResponse(BaseModel):
    job_id: Optional[str] = None
    payload: Optional[dict] = None


class GatewaySubmitRequest(BaseModel):
    gateway_key: str
    results: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class GatewayRelayConfigRequest(BaseModel):
    gateway_key: str
    relay_connection_string: str   # empty string = clear relay config


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=GatewayRegisterResponse, summary="Register a new gateway")
async def register_gateway(
    body: GatewayRegisterRequest,
    current_user: dict = Depends(get_current_user),
):
    gateway_key = str(uuid.uuid4())
    azure_store.register_gateway(gateway_key, body.name, user_id=current_user["user_id"])
    logger.info("Gateway registered: %s (%s) by user %s", body.name, gateway_key, current_user["user_id"])
    return GatewayRegisterResponse(
        gateway_key=gateway_key,
        name=body.name,
        message=(
            "Gateway registered. Download the agent, set GATEWAY_KEY to this value, "
            "and run it on any machine inside the client network."
        ),
    )


@router.get("/list", summary="List registered gateways for current user")
async def list_gateways(current_user: dict = Depends(get_current_user)):
    return azure_store.list_gateways(user_id=current_user["user_id"])


@router.get("/status", summary="Check one gateway status")
async def gateway_status(gateway_key: str, current_user: dict = Depends(get_current_user)):
    gw = azure_store.get_gateway(gateway_key)
    if not gw or gw.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Gateway not found.")
    return gw


@router.post("/relay/config", summary="Store Azure Relay connection string for a gateway")
async def set_relay_config(
    body: GatewayRelayConfigRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Associate an Azure Relay Hybrid Connection string with a registered gateway.
    The agent will listen on this relay for jobs instead of polling.

    Pass relay_connection_string="" to remove relay mode and revert to polling.
    """
    from app.services import relay_service

    gw = azure_store.get_gateway(body.gateway_key)
    if not gw or gw.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Gateway not found.")

    conn_str = body.relay_connection_string.strip()
    if conn_str and not relay_service.is_valid_conn_str(conn_str):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid relay connection string. "
                "Required format: Endpoint=sb://<namespace>.servicebus.windows.net/;"
                "SharedAccessKeyName=<name>;SharedAccessKey=<key>;EntityPath=<hc-name>"
            ),
        )

    azure_store.set_gateway_relay(body.gateway_key, conn_str)
    logger.info(
        "Gateway %s relay config %s by user %s",
        body.gateway_key[:8],
        "updated" if conn_str else "cleared",
        current_user["user_id"],
    )
    return {"ok": True, "relay_configured": bool(conn_str)}


@router.post("/heartbeat", summary="Agent heartbeat — marks gateway as online")
async def gateway_heartbeat(gateway_key: str):
    """
    Called periodically by agents running in Service Bus mode (which don't poll).
    Keeps the gateway status green in the portal.
    """
    gw = azure_store.get_gateway(gateway_key)
    if not gw:
        raise HTTPException(status_code=403, detail="Unknown gateway key.")
    azure_store.update_gateway_seen(gateway_key)
    return {"ok": True}


@router.get("/poll", response_model=GatewayPollResponse, summary="Agent polls for pending jobs")
async def poll_for_job(gateway_key: str):
    """
    The agent calls this endpoint every few seconds.
    Returns the next pending job assigned to this gateway, or job_id=null if idle.
    """
    # Confirm gateway exists
    try:
        gw = azure_store.get_gateway(gateway_key)
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable — retry shortly.")
    if not gw:
        raise HTTPException(status_code=403, detail="Unknown gateway key.")

    # Heartbeat — mark gateway as online
    azure_store.update_gateway_seen(gateway_key)

    job = azure_store.get_pending_gateway_job(gateway_key)
    if not job:
        return GatewayPollResponse(job_id=None, payload=None)

    job_id = job["job_id"]
    payload = json.loads(job["gateway_payload"])

    # Mark job as running and clear the credential payload immediately
    try:
        job_store.update_job(
            job_id,
            status=JobStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
            progress_message="Agent picked up job — running locally…",
        )
        azure_store.clear_gateway_payload(job_id)
    except Exception:
        logger.exception("Failed to mark job %s as running after gateway poll", job_id)
        raise HTTPException(status_code=500, detail="Failed to claim job — please retry.")

    logger.info("Gateway %s…%s picked up job %s", gateway_key[:4], gateway_key[-4:], job_id)
    return GatewayPollResponse(job_id=job_id, payload=payload)


@router.post("/submit/{job_id}", summary="Agent submits assessment results")
async def submit_job_results(job_id: str, body: GatewaySubmitRequest):
    """
    Agent calls this after running the assessment locally.
    Results are persisted to Azure SQL and an Excel report is generated.
    """
    # Verify job exists
    try:
        record = job_store.get_job(job_id)
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable — retry shortly.")
    if record is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    if body.error:
        logger.error("Gateway job %s failed: %s", job_id, body.error)
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=body.error,
            progress_message=None,
        )
        return {"ok": True}

    if not body.results:
        raise HTTPException(status_code=400, detail="Either 'results' or 'error' must be provided.")

    try:
        raw: dict[str, Any] = body.results

        job_store.update_job(job_id, progress_message="Persisting results to Azure SQL…")

        # Overview — agent sends raw query rows; extract into the right shape
        overview_raw = raw.get("overview")
        if isinstance(overview_raw, list):
            overview_dict = _extract_overview(overview_raw)
        elif isinstance(overview_raw, dict):
            overview_dict = overview_raw
        else:
            overview_dict = None

        azure_store.save_overview(job_id, overview_dict)
        azure_store.save_sections(job_id, raw)

        job_store.update_job(job_id, progress_message="Building Excel report…")
        report_path = report_service.build_report(job_id, raw, db_type=raw.get("_db_type", "mssql"))

        job_store.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
            report_path=report_path,
            progress_message="Completed via gateway agent.",
        )

        logger.info("Gateway job %s completed successfully", job_id)
        return {"ok": True}

    except Exception as exc:
        logger.exception("Failed to process gateway results for job %s", job_id)
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc),
            error=str(exc),
            progress_message=None,
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/download", summary="Download the SAT Gateway Agent script")
async def download_agent():
    """Serves the agent Python script for download."""
    # agent.py is at /app/app/agent.py inside Docker
    # __file__ = /app/app/api/v1/routes/gateway.py → parents[3] = /app/app
    agent_path = Path(__file__).parents[3] / "agent.py"
    if not agent_path.is_file():
        raise HTTPException(status_code=404, detail="Agent script not found on server.")
    return FileResponse(
        path=str(agent_path),
        media_type="text/x-python",
        filename="sat_agent.py",
    )
