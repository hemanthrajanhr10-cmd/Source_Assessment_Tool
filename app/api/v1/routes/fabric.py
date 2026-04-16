"""
Fabric Workspace Assessment API routes.

POST   /api/v1/fabric/auth/start           — start device-code auth flow
GET    /api/v1/fabric/auth/{id}/status     — poll auth status
POST   /api/v1/fabric/sessions             — start a Fabric assessment session
GET    /api/v1/fabric/sessions             — list all Fabric sessions
GET    /api/v1/fabric/sessions/{id}        — get session status + results
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.services import fabric_service

router = APIRouter()
logger = get_logger(__name__)


# ── Auth endpoints ────────────────────────────────────────────────────────────

@router.post("/auth/start")
async def start_fabric_auth(_user=Depends(get_current_user)):
    """
    Start a Microsoft device-code auth flow.
    Returns user_code + verification_url to show to the client.
    """
    try:
        result = fabric_service.start_device_auth()
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/auth/{auth_id}/status")
async def get_fabric_auth_status(auth_id: str, _user=Depends(get_current_user)):
    """Poll this until status == 'ready'. Then POST /sessions to start assessment."""
    return fabric_service.get_auth_status(auth_id)


# ── Session endpoints ─────────────────────────────────────────────────────────

def _run_fabric_assessment_task(fabric_session_id: str, auth_id: str) -> None:
    """Background task: run assessment, persist results."""
    azure_store.update_fabric_session(fabric_session_id, status="running",
                                      progress_message="Connecting to Power BI…")
    try:
        def _progress(msg: str):
            azure_store.update_fabric_session(fabric_session_id, progress_message=msg)

        results = fabric_service.run_fabric_assessment(
            fabric_session_id=fabric_session_id,
            auth_id=auth_id,
            on_progress=_progress,
        )
        azure_store.update_fabric_session(
            fabric_session_id,
            status="completed",
            completed_at=datetime.now(timezone.utc),
            progress_message="Assessment complete.",
            results_json=json.dumps(results, default=str),
        )
        logger.info("Fabric session %s completed", fabric_session_id)
    except Exception as exc:
        logger.error("Fabric session %s failed: %s", fabric_session_id, exc, exc_info=True)
        azure_store.update_fabric_session(
            fabric_session_id,
            status="failed",
            completed_at=datetime.now(timezone.utc),
            error=str(exc),
            progress_message=None,
        )


@router.post("/sessions", status_code=202)
async def create_fabric_session(
    body: dict,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """
    Start a Fabric workspace assessment.
    Body: { "auth_id": "<uuid>", "label": "<optional>" }
    """
    auth_id = body.get("auth_id", "")
    label   = body.get("label") or None

    status = fabric_service.get_auth_status(auth_id)
    if status.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Microsoft auth not completed yet. Poll /auth/{id}/status until ready.",
        )

    fabric_session_id = str(uuid.uuid4())
    try:
        await run_in_threadpool(
            azure_store.create_fabric_session,
            session_id=fabric_session_id,
            label=label,
            user_id=current_user["user_id"],
        )
    except Exception as exc:
        logger.error("Failed to create fabric session record: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    background_tasks.add_task(_run_fabric_assessment_task, fabric_session_id, auth_id)

    return {
        "fabric_session_id": fabric_session_id,
        "status": "running",
        "message": "Fabric assessment started.",
    }


@router.get("/sessions")
async def list_fabric_sessions(current_user=Depends(get_current_user)):
    """List all Fabric assessment sessions for the current user."""
    return await run_in_threadpool(azure_store.list_fabric_sessions, user_id=current_user["user_id"])


@router.get("/sessions/{fabric_session_id}")
async def get_fabric_session(
    fabric_session_id: str,
    current_user=Depends(get_current_user),
):
    """Get status and full results for a Fabric assessment session."""
    record = await run_in_threadpool(azure_store.get_fabric_session, fabric_session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Fabric session not found")

    results = None
    if record.get("results_json"):
        try:
            results = json.loads(record["results_json"])
        except Exception:
            results = None

    return {
        "fabric_session_id": fabric_session_id,
        "label": record.get("label"),
        "status": record.get("status"),
        "created_at": record.get("created_at"),
        "completed_at": record.get("completed_at"),
        "error": record.get("error"),
        "progress_message": record.get("progress_message"),
        "results": results,
    }
