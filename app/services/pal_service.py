"""
Azure Partner Admin Link (PAL) linking — Management Partner ARM API.

Links UBTI's Associated Partner ID to the client's Azure tenant using an
Azure AD access token acquired client-side (MSAL popup) from an account
that already holds RBAC access in the client's tenant/subscription.
"""

import asyncio
from typing import Any, Optional

import requests
from jose import JWTError, jwt

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

ARM_PARTNER_URL = "https://management.azure.com/providers/Microsoft.ManagementPartner/partners/{partner_id}?api-version=2018-02-01"


def decode_tenant_id(aad_access_token: str) -> Optional[str]:
    """Best-effort tenant extraction from any Azure AD access token's `tid` claim."""
    try:
        claims = jwt.get_unverified_claims(aad_access_token)
        return claims.get("tid")
    except JWTError:
        return None


def classify_arm_error(status_code: int, body: str) -> str:
    """Map an ARM error response to one of the four PalFailureReason values."""
    if status_code == 401:
        return "auth_error"
    if status_code == 403:
        return "access_not_granted"
    lowered = (body or "").lower()
    if "tenant" in lowered and ("mismatch" in lowered or "not found" in lowered or "invalid" in lowered):
        return "wrong_tenant"
    return "unknown"


def _put_partner_link(aad_access_token: str, partner_id: str) -> tuple[bool, int, str]:
    url = ARM_PARTNER_URL.format(partner_id=partner_id)
    resp = requests.put(
        url,
        headers={
            "Authorization": f"Bearer {aad_access_token}",
            "Content-Type": "application/json",
        },
        json={},
        timeout=30,
    )
    return resp.ok, resp.status_code, resp.text[:500]


async def link_partner_admin(aad_access_token: str) -> dict[str, Any]:
    """
    Perform the ARM PUT to link UBTI's partner ID to the client tenant behind
    `aad_access_token`. Returns {success, client_tenant_id, failure_reason?}.
    """
    client_tenant_id = decode_tenant_id(aad_access_token)
    if client_tenant_id is None:
        return {"success": False, "client_tenant_id": None, "failure_reason": "auth_error"}

    if not settings.pal_partner_id:
        logger.error("PAL link attempted but PAL_PARTNER_ID is not configured")
        return {"success": False, "client_tenant_id": client_tenant_id, "failure_reason": "unknown"}

    try:
        ok, status_code, body = await asyncio.to_thread(
            _put_partner_link, aad_access_token, settings.pal_partner_id
        )
    except requests.RequestException as exc:
        logger.warning("PAL ARM call failed: %s", exc)
        return {"success": False, "client_tenant_id": client_tenant_id, "failure_reason": "unknown"}

    if ok:
        return {"success": True, "client_tenant_id": client_tenant_id}

    failure_reason = classify_arm_error(status_code, body)
    logger.info("PAL link failed (%s): %s", status_code, body)
    return {"success": False, "client_tenant_id": client_tenant_id, "failure_reason": failure_reason}
