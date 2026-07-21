"""
Fabric assessment — Azure Partner Admin Link (PAL) routes.

  GET  /fabric/pal/config                 → {organization_name, docs_url, client_id, tenant_id}
  GET  /fabric/sessions/{id}/pal-status   → PalLinkStatus
  POST /fabric/sessions/{id}/pal-link     → PalLinkStatus (status='linking'), links in background
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.services import pal_service

logger = get_logger(__name__)
router = APIRouter()

PAL_DOCS_URL = "https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/link-partner-id"


class PalLinkRequest(BaseModel):
    aad_access_token: str


def _default_status(session_id: str) -> dict[str, Any]:
    return {
        "assessment_id": session_id,
        "client_tenant_id": None,
        "status": "not_linked",
        "failure_reason": None,
        "linked_at": None,
    }


def _format_status(row: dict[str, Any]) -> dict[str, Any]:
    linked_at = row.get("linked_at")
    return {
        "assessment_id": row.get("assessment_id"),
        "client_tenant_id": row.get("client_tenant_id"),
        "status": row.get("status", "not_linked"),
        "failure_reason": row.get("failure_reason"),
        "linked_at": linked_at.isoformat() if isinstance(linked_at, datetime) else linked_at,
    }


@router.get("/pal/config")
async def get_pal_config(_: Any = Depends(get_current_user)):
    return {
        "organization_name": settings.pal_organization_name,
        "docs_url": PAL_DOCS_URL,
        "client_id": settings.azure_pal_client_id,
        "tenant_id": settings.azure_pal_tenant_id,
    }


@router.get("/sessions/{session_id}/pal-status")
async def get_pal_status(session_id: str, _: Any = Depends(get_current_user)):
    if not azure_store.get_fabric_session(session_id):
        raise HTTPException(status_code=404, detail="Fabric session not found")
    row = azure_store.get_fabric_pal_status(session_id)
    if not row:
        return _default_status(session_id)

    # Opportunistic upgrade: if this assessment isn't linked yet but its client
    # tenant was already linked via a different assessment, adopt that status
    # so the client is never asked to link the same tenant twice.
    if row.get("status") != "linked" and row.get("client_tenant_id"):
        tenant_linked = azure_store.get_fabric_pal_status_by_tenant(row["client_tenant_id"])
        if tenant_linked:
            azure_store.upsert_fabric_pal_status(
                session_id,
                status="linked",
                client_tenant_id=row["client_tenant_id"],
                linked_at=tenant_linked.get("linked_at"),
            )
            row = azure_store.get_fabric_pal_status(session_id)

    return _format_status(row) if row else _default_status(session_id)


async def _run_pal_link(session_id: str, aad_access_token: str) -> None:
    result = await pal_service.link_partner_admin(aad_access_token)
    if result["success"]:
        azure_store.upsert_fabric_pal_status(
            session_id,
            status="linked",
            client_tenant_id=result.get("client_tenant_id"),
            linked_at=datetime.now(timezone.utc),
        )
    else:
        azure_store.upsert_fabric_pal_status(
            session_id,
            status="failed",
            client_tenant_id=result.get("client_tenant_id"),
            failure_reason=result.get("failure_reason", "unknown"),
        )


@router.post("/sessions/{session_id}/pal-link")
async def link_pal(
    session_id: str,
    body: PalLinkRequest,
    background_tasks: BackgroundTasks,
    _: Any = Depends(get_current_user),
):
    if not azure_store.get_fabric_session(session_id):
        raise HTTPException(status_code=404, detail="Fabric session not found")

    azure_store.upsert_fabric_pal_status(session_id, status="linking")
    background_tasks.add_task(_run_pal_link, session_id, body.aad_access_token)

    row = azure_store.get_fabric_pal_status(session_id)
    return _format_status(row) if row else _default_status(session_id)
