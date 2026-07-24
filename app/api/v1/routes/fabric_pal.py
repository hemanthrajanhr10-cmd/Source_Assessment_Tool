"""
Fabric assessment — Azure Partner Admin Link (PAL) routes.

  GET  /fabric/pal/config                              → {organization_name, docs_url}
  GET  /fabric/sessions/{id}/pal-status                 → PalLinkStatus (persisted)
  POST /fabric/sessions/{id}/pal-link/start              → starts a PowerShell device-code link session
  GET  /fabric/sessions/{id}/pal-link/{ps_auth_id}/status → device-code session state (polled)
  POST /fabric/sessions/{id}/pal-link/{ps_auth_id}/cancel → kills the PowerShell subprocess
"""

import asyncio
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.services import pal_powershell_service

logger = get_logger(__name__)
router = APIRouter()

PAL_DOCS_URL = "https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/link-partner-id"

# Tracks which terminal PowerShell sessions have already been persisted to the
# DB, so repeated polls of the same ps_auth_id don't re-run the upsert.
_persisted_ps_sessions: set[str] = set()


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


def _format_ps_session(session_id: str, ps_auth_id: str, sess: dict[str, Any]) -> dict[str, Any]:
    return {
        "ps_auth_id": ps_auth_id,
        "status": sess.get("status", "starting"),
        "user_code": sess.get("user_code"),
        "verification_url": sess.get("verification_url"),
        "expires_at": sess.get("expires_at"),
        "failure_reason": sess.get("failure_reason"),
    }


@router.post("/sessions/{session_id}/pal-link/start")
async def start_pal_link(session_id: str, _: Any = Depends(get_current_user)):
    if not azure_store.get_fabric_session(session_id):
        raise HTTPException(status_code=404, detail="Fabric session not found")

    ps_auth_id = str(uuid.uuid4())
    azure_store.upsert_fabric_pal_status(session_id, status="linking")

    t = threading.Thread(
        target=pal_powershell_service.start_link_session,
        args=(ps_auth_id, settings.pal_partner_id),
        daemon=True,
    )
    t.start()

    # Wait briefly for the device-code prompt to appear so the client sees it
    # without an extra round trip — mirrors the Fabric device-code auth/start.
    for _ in range(16):
        await asyncio.sleep(0.5)
        sess = pal_powershell_service.get_session(ps_auth_id)
        if sess and sess.get("status") != "starting":
            break

    sess = pal_powershell_service.get_session(ps_auth_id) or {"status": "starting"}
    return _format_ps_session(session_id, ps_auth_id, sess)


@router.get("/sessions/{session_id}/pal-link/{ps_auth_id}/status")
async def pal_link_status(session_id: str, ps_auth_id: str, _: Any = Depends(get_current_user)):
    sess = pal_powershell_service.get_session(ps_auth_id)
    if not sess:
        raise HTTPException(status_code=404, detail="PAL link session not found")

    if ps_auth_id not in _persisted_ps_sessions:
        if sess.get("status") == "linked":
            azure_store.upsert_fabric_pal_status(
                session_id,
                status="linked",
                client_tenant_id=sess.get("tenant_id"),
                linked_at=datetime.now(timezone.utc),
            )
            _persisted_ps_sessions.add(ps_auth_id)
        elif sess.get("status") == "failed":
            azure_store.upsert_fabric_pal_status(
                session_id,
                status="failed",
                client_tenant_id=sess.get("tenant_id"),
                failure_reason=sess.get("failure_reason", "unknown"),
            )
            _persisted_ps_sessions.add(ps_auth_id)

    return _format_ps_session(session_id, ps_auth_id, sess)


@router.post("/sessions/{session_id}/pal-link/{ps_auth_id}/cancel")
async def cancel_pal_link(session_id: str, ps_auth_id: str, _: Any = Depends(get_current_user)):
    cancelled = pal_powershell_service.cancel_link_session(ps_auth_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="PAL link session not found")
    azure_store.upsert_fabric_pal_status(session_id, status="not_linked")
    return {"ok": True}
