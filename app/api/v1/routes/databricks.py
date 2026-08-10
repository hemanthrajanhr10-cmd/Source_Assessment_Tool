"""
Databricks workspace assessment routes.
Prefix: /api/v1/databricks
"""

import asyncio

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import Response

from app.models.databricks_requests import (
    DatabricksAssessmentRequest,
    DatabricksAssessmentResult,
    DatabricksJobResponse,
    DatabricksJobStatusResponse,
)
from app.services import databricks_service

router = APIRouter(prefix="/api/v1/databricks")


# ── Test Connection ───────────────────────────────────────────────────────────

@router.post("/test-connection")
async def test_connection(request: DatabricksAssessmentRequest):
    """Validate a PAT and return the caller identity."""
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, databricks_service.test_connection, request
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Start Assessment ──────────────────────────────────────────────────────────

@router.post("/assess", response_model=DatabricksJobResponse, status_code=202)
async def start_assessment(
    request: DatabricksAssessmentRequest,
    background_tasks: BackgroundTasks,
):
    """Create a new assessment job and start it asynchronously."""
    job = databricks_service.create_job(request)
    background_tasks.add_task(databricks_service.run_assessment, job["job_id"], request)
    return DatabricksJobResponse(
        job_id=job["job_id"],
        status="pending",
        message="Assessment started",
    )


# ── Job Status ────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/status", response_model=DatabricksJobStatusResponse)
async def get_job_status(job_id: str):
    job = databricks_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return DatabricksJobStatusResponse(
        job_id=job["job_id"],
        status=job.get("status", "unknown"),
        label=job.get("label"),
        progress_message=job.get("progress_message"),
        error=job.get("error"),
        created_at=str(job.get("created_at", "")),
        completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
        workspace_url=job.get("workspace_url"),
    )


# ── Job Results ───────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/results", response_model=DatabricksAssessmentResult)
async def get_job_results(job_id: str):
    job = databricks_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Job status: {job.get('status')}")
    results = job.get("results") or job.get("result")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available")
    if isinstance(results, dict):
        return DatabricksAssessmentResult(**results)
    return results


# ── Excel Report ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/report")
async def download_report(job_id: str):
    job = databricks_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Job status: {job.get('status')}")
    results = job.get("results") or job.get("result")
    if not results:
        raise HTTPException(status_code=404, detail="Results not available")
    if isinstance(results, dict):
        result_obj = DatabricksAssessmentResult(**results)
    else:
        result_obj = results
    xlsx = await asyncio.get_event_loop().run_in_executor(
        None, databricks_service.build_excel, result_obj
    )
    label = (result_obj.label or "databricks").replace(" ", "_")
    filename = f"databricks_{label}_{job_id[:8]}.xlsx"
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── List Sessions ─────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions():
    return databricks_service.list_jobs()
