"""
Unified Assessment Session API routes.

POST /api/v1/unified-sessions              — create a unified session (mode: source|fabric|both)
GET  /api/v1/unified-sessions              — list all unified sessions for current user
GET  /api/v1/unified-sessions/{id}         — get full status + child session details
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store

router = APIRouter()
logger = get_logger(__name__)

_VALID_MODES = {"source", "fabric", "both"}


@router.post("", status_code=201)
async def create_unified_session(
    body: dict,
    current_user=Depends(get_current_user),
):
    """
    Create a new unified assessment session.
    Body: { "mode": "source" | "fabric" | "both", "label": "<optional>" }
    Returns the unified_session_id to pass when creating child source/fabric sessions.
    """
    mode = body.get("mode", "both")
    if mode not in _VALID_MODES:
        raise HTTPException(status_code=400, detail="mode must be 'source', 'fabric', or 'both'")

    label = body.get("label") or None
    unified_session_id = str(uuid.uuid4())

    try:
        await run_in_threadpool(
            azure_store.create_unified_session,
            unified_session_id=unified_session_id,
            user_id=current_user["user_id"],
            label=label,
            mode=mode,
        )
    except Exception as exc:
        logger.error("Failed to create unified session: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    logger.info("Unified session %s created (mode=%s)", unified_session_id, mode)
    return {"unified_session_id": unified_session_id, "mode": mode, "status": "pending"}


@router.get("")
async def list_unified_sessions(current_user=Depends(get_current_user)):
    """List all unified assessment sessions for the current user, with computed status."""
    rows = await run_in_threadpool(
        azure_store.list_unified_sessions,
        user_id=current_user["user_id"],
    )
    result = []
    for row in rows:
        # Lightweight listing: fetch child statuses without full results
        enriched = await _enrich_session_summary(row)
        result.append(enriched)
    return result


@router.get("/{unified_session_id}")
async def get_unified_session(
    unified_session_id: str,
    current_user=Depends(get_current_user),
):
    """Get full details for a unified assessment session, including both child sessions."""
    row = await run_in_threadpool(azure_store.get_unified_session, unified_session_id)
    if not row or row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Unified session not found.")

    return await _enrich_session_full(row)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _enrich_session_summary(row: dict) -> dict:
    """Fetch child session statuses (no heavy results JSON) and compute unified status."""
    source_status = None
    fabric_status = None

    if row.get("source_session_id"):
        src = await run_in_threadpool(azure_store.get_session, row["source_session_id"])
        if src:
            source_status = src.get("status", "pending")

    if row.get("fabric_session_id"):
        fab = await run_in_threadpool(azure_store.get_fabric_session, row["fabric_session_id"])
        if fab:
            fabric_status = fab.get("status", "pending")

    status = _compute_status(row.get("mode", "both"), source_status, fabric_status)

    return {
        "unified_session_id": row.get("unified_session_id"),
        "label": row.get("label"),
        "mode": row.get("mode"),
        "status": status,
        "created_at": row.get("created_at"),
        "completed_at": row.get("completed_at"),
        "source_session_id": row.get("source_session_id"),
        "fabric_session_id": row.get("fabric_session_id"),
        "source_status": source_status,
        "fabric_status": fabric_status,
    }


async def _enrich_session_full(row: dict) -> dict:
    """Fetch full child session data including Fabric results JSON."""
    mode = row.get("mode", "both")
    source_data: Optional[dict] = None
    fabric_data: Optional[dict] = None

    if row.get("source_session_id"):
        src = await run_in_threadpool(azure_store.get_session, row["source_session_id"])
        if src:
            jobs = await run_in_threadpool(azure_store.list_session_jobs, row["source_session_id"])
            source_data = {
                "session_id": src.get("session_id"),
                "label": src.get("label"),
                "status": src.get("status"),
                "total_jobs": src.get("total_jobs", 0),
                "completed_jobs": src.get("completed_jobs", 0),
                "failed_jobs": src.get("failed_jobs", 0),
                "created_at": src.get("created_at"),
                "completed_at": src.get("completed_at"),
                "jobs": [
                    {
                        "job_id": j.get("job_id"),
                        "server": j.get("server_name", ""),
                        "database": j.get("database_name", ""),
                        "status": j.get("status"),
                        "progress_message": j.get("progress_message"),
                        "error": j.get("error"),
                        "started_at": j.get("started_at"),
                        "completed_at": j.get("completed_at"),
                    }
                    for j in jobs
                ],
            }

    if row.get("fabric_session_id"):
        fab = await run_in_threadpool(azure_store.get_fabric_session, row["fabric_session_id"])
        if fab:
            results = None
            if fab.get("results_json"):
                try:
                    results = json.loads(fab["results_json"])
                except Exception:
                    pass
            fabric_data = {
                "fabric_session_id": fab.get("session_id"),
                "label": fab.get("label"),
                "status": fab.get("status"),
                "created_at": fab.get("created_at"),
                "completed_at": fab.get("completed_at"),
                "error": fab.get("error"),
                "progress_message": fab.get("progress_message"),
                "results": results,
            }

    source_status = source_data.get("status") if source_data else None
    fabric_status = fabric_data.get("status") if fabric_data else None
    status = _compute_status(mode, source_status, fabric_status)

    return {
        "unified_session_id": row.get("unified_session_id"),
        "label": row.get("label"),
        "mode": mode,
        "status": status,
        "created_at": row.get("created_at"),
        "completed_at": row.get("completed_at"),
        "source_session_id": row.get("source_session_id"),
        "fabric_session_id": row.get("fabric_session_id"),
        "source": source_data,
        "fabric": fabric_data,
    }


def _compute_status(mode: str, source_status: Optional[str], fabric_status: Optional[str]) -> str:
    """Derive unified session status from child session states."""
    if mode == "source":
        return source_status or "pending"

    if mode == "fabric":
        return fabric_status or "pending"

    # mode == "both"
    if source_status is None:
        return "pending"

    # Source started — check if fabric is also done
    if fabric_status is None:
        if source_status in ("completed", "partial"):
            return "source_done"   # source finished, fabric not yet started
        return source_status        # running / failed

    # Both have statuses
    terminal = {"completed", "partial", "failed", "cancelled"}
    if source_status in terminal and fabric_status in terminal:
        if source_status == "failed" and fabric_status == "failed":
            return "failed"
        if source_status == "cancelled" or fabric_status == "cancelled":
            return "cancelled"
        if source_status == "failed" or fabric_status == "failed":
            return "partial"
        return "completed"

    return "running"
