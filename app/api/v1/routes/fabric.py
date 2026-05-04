"""
Fabric Workspace Assessment API routes.

POST   /api/v1/fabric/auth/start              — start device-code auth flow
GET    /api/v1/fabric/auth/{id}/status        — poll auth status
GET    /api/v1/fabric/auth/{id}/workspaces    — list workspaces the user can access
POST   /api/v1/fabric/sessions                — start a Fabric assessment session
GET    /api/v1/fabric/sessions                — list all Fabric sessions
GET    /api/v1/fabric/sessions/{id}           — get session status + results
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
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
    """Poll this until status == 'ready'. Then fetch workspaces and POST /sessions."""
    return fabric_service.get_auth_status(auth_id)


@router.get("/auth/{auth_id}/workspaces")
async def list_fabric_workspaces(auth_id: str, _user=Depends(get_current_user)):
    """
    Return the list of Power BI / Fabric workspaces the authenticated user can access.
    Call this once auth status is 'ready' to populate the workspace picker.
    """
    status = fabric_service.get_auth_status(auth_id)
    if status.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Microsoft auth not completed yet. Poll /auth/{id}/status until ready.",
        )
    try:
        workspaces = await run_in_threadpool(fabric_service.list_workspaces, auth_id)
        return workspaces
    except Exception as exc:
        logger.error("Failed to list Fabric workspaces: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/auth/{auth_id}/workspace-items")
async def list_fabric_workspace_items(
    auth_id: str,
    body: dict,
    _user=Depends(get_current_user),
):
    """
    Return the datasets and reports inside each selected workspace.
    Body: { "workspace_ids": ["<ws-id-1>", "<ws-id-2>"] }
    Used to populate the model/report picker after workspace selection.
    """
    status = fabric_service.get_auth_status(auth_id)
    if status.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Microsoft auth not completed yet.",
        )
    workspace_ids: list[str] = body.get("workspace_ids") or []
    if not workspace_ids:
        raise HTTPException(status_code=400, detail="workspace_ids is required.")
    try:
        items = await run_in_threadpool(
            fabric_service.list_workspace_items, auth_id, workspace_ids
        )
        return items
    except Exception as exc:
        logger.error("Failed to list workspace items: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))


# ── Session endpoints ─────────────────────────────────────────────────────────

def _run_fabric_assessment_task(
    fabric_session_id:    str,
    auth_id:              str,
    workspace_ids:        Optional[list[str]],
    selected_dataset_ids: Optional[set[str]],
    selected_report_ids:  Optional[set[str]],
) -> None:
    """Background task: run assessment for selected workspaces/models/reports, persist results."""
    azure_store.update_fabric_session(
        fabric_session_id,
        status="running",
        progress_message="Connecting to Power BI…",
    )
    try:
        def _progress(msg: str):
            azure_store.update_fabric_session(fabric_session_id, progress_message=msg)

        results = fabric_service.run_fabric_assessment(
            fabric_session_id=fabric_session_id,
            auth_id=auth_id,
            workspace_ids=workspace_ids or None,
            selected_dataset_ids=selected_dataset_ids,  # preserve set() — do NOT coerce to None
            selected_report_ids=selected_report_ids,    # preserve set() — do NOT coerce to None
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
    Body: {
        "auth_id": "<uuid>",
        "label": "<optional>",
        "workspace_ids": ["<ws-id-1>", "<ws-id-2>"]   ← required; list of workspace IDs to assess
    }
    """
    auth_id           = body.get("auth_id", "")
    label             = body.get("label") or None
    workspace_ids: list[str] = body.get("workspace_ids") or []
    dataset_ids:  list[str] = body.get("dataset_ids") or []
    report_ids:   list[str] = body.get("report_ids") or []
    unified_session_id: Optional[str] = body.get("unified_session_id") or None

    if not workspace_ids:
        raise HTTPException(
            status_code=400,
            detail="workspace_ids is required. Fetch workspaces via GET /auth/{id}/workspaces and select at least one.",
        )

    if not dataset_ids and not report_ids:
        raise HTTPException(
            status_code=400,
            detail="Select at least one semantic model or report to assess.",
        )

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

    if unified_session_id:
        try:
            await run_in_threadpool(azure_store.link_unified_fabric, unified_session_id, fabric_session_id)
        except Exception as exc:
            logger.warning("Could not link fabric session %s to unified session %s: %s", fabric_session_id, unified_session_id, exc)

    # None  → no filter, assess everything in that category.
    # set() → empty filter, skip that category entirely.
    # This lets models-only and reports-only selections work correctly.
    selected_datasets = (
        set(dataset_ids) if dataset_ids        # explicit model selection
        else (set() if report_ids else None)   # reports-only → skip all models
    )
    selected_reports = (
        set(report_ids) if report_ids          # explicit report selection
        else (set() if dataset_ids else None)  # models-only → skip all reports
    )

    background_tasks.add_task(
        _run_fabric_assessment_task,
        fabric_session_id,
        auth_id,
        workspace_ids,
        selected_datasets,
        selected_reports,
    )

    model_count  = len(dataset_ids)
    report_count = len(report_ids)
    return {
        "fabric_session_id": fabric_session_id,
        "status": "running",
        "message": (
            f"Fabric assessment started: {model_count} model(s), "
            f"{report_count} report(s) across {len(workspace_ids)} workspace(s)."
        ),
    }


@router.get("/sessions")
async def list_fabric_sessions(current_user=Depends(get_current_user)):
    """List all Fabric assessment sessions for the current user."""
    return await run_in_threadpool(azure_store.list_fabric_sessions, user_id=current_user["user_id"])


@router.post("/sessions/{fabric_session_id}/cancel", status_code=200)
async def cancel_fabric_session(
    fabric_session_id: str,
    current_user=Depends(get_current_user),
):
    """
    Request cancellation of a running Fabric assessment.
    The background task checks for this signal at each workspace/report boundary
    and stops gracefully, saving whatever partial results have been collected.
    """
    record = await run_in_threadpool(azure_store.get_fabric_session, fabric_session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Fabric session not found")
    if record.get("status") != "running":
        return {"message": "Session is not running.", "status": record.get("status")}

    fabric_service.request_cancel(fabric_session_id)
    await run_in_threadpool(
        azure_store.update_fabric_session,
        fabric_session_id,
        status="cancelled",
        completed_at=datetime.now(timezone.utc),
        progress_message="Cancelled by user.",
    )
    logger.info("Fabric session %s cancelled by user %s", fabric_session_id, current_user["user_id"])
    return {"message": "Cancellation requested.", "status": "cancelled"}


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


@router.get("/sessions/{fabric_session_id}/export/excel")
async def export_fabric_excel(
    fabric_session_id: str,
    current_user=Depends(get_current_user),
):
    """
    Export a completed Fabric assessment session as a multi-sheet Excel workbook.
    Sheets: Summary, Workspaces, Semantic Models, Tables, Measures,
            Calculated Columns, Calculated Tables, Relationships,
            Reports, Report Visuals, Bookmarks, Complexity Analysis.
    """
    record = await run_in_threadpool(azure_store.get_fabric_session, fabric_session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Fabric session not found")
    if record.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Session is not completed yet.")

    results = None
    if record.get("results_json"):
        try:
            results = json.loads(record["results_json"])
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to parse session results.")

    if not results:
        raise HTTPException(status_code=404, detail="No results found for this session.")

    try:
        xlsx_bytes = await run_in_threadpool(fabric_service.generate_fabric_excel, results)
    except Exception as exc:
        logger.error("Excel export failed for session %s: %s", fabric_session_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Excel generation failed: {exc}")

    label    = (record.get("label") or "fabric-assessment").replace(" ", "_")
    filename = f"{label}_{fabric_session_id[:8]}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
