"""
Hybrid Connections API routes.

POST   /api/v1/hybrid-connections           — create + auto-provision in Azure
GET    /api/v1/hybrid-connections           — list connections for the current user
DELETE /api/v1/hybrid-connections/{id}      — delete (owner only)

Auto-provisioning uses the Azure SDK with DefaultAzureCredential (Managed Identity
on App Service, or AZURE_CLIENT_ID/SECRET/TENANT_ID for local dev).

Required environment variables for provisioning:
    AZURE_SUBSCRIPTION_ID   — Azure subscription ID
    AZURE_RESOURCE_GROUP    — Resource group containing the App Service
    AZURE_APP_SERVICE_NAME  — Name of the App Service
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store

router = APIRouter()
logger = get_logger(__name__)


# ── Request / Response models ──────────────────────────────────────────────────

class CreateHybridConnectionRequest(BaseModel):
    name: str = Field(..., description="Hybrid connection name, e.g. sat-onprem-sql")
    endpoint_host: str = Field(..., description="SQL Server hostname or IP visible from VPN laptop")
    endpoint_port: int = Field(1433, ge=1, le=65535, description="SQL Server port")
    service_bus_namespace: str = Field(..., description="Service Bus namespace short name or FQDN")


class HybridConnectionResponse(BaseModel):
    connection_id: str
    name: str
    endpoint_host: str
    endpoint_port: int
    service_bus_namespace: str
    status: str
    created_at: str
    error_detail: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalise_namespace(ns: str) -> str:
    """Keep only the short namespace name (strip .servicebus.windows.net if present)."""
    return ns.replace(".servicebus.windows.net", "").strip()


def _provision_hybrid_connection(
    name: str,
    endpoint_host: str,
    endpoint_port: int,
    namespace: str,
) -> tuple[str, Optional[str]]:
    """
    Use the Azure SDK to:
      1. Create the Relay Hybrid Connection entity in the given namespace.
      2. Attach it to the App Service.

    Returns (status, error_detail).
    status is one of: 'provisioned' | 'config_missing' | 'error'
    """
    subscription_id = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
    resource_group  = os.environ.get("AZURE_RESOURCE_GROUP", "").strip()
    app_service     = os.environ.get("AZURE_APP_SERVICE_NAME", "").strip()

    if not subscription_id or not resource_group or not app_service:
        logger.info(
            "Hybrid Connection auto-provision skipped: "
            "AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP / AZURE_APP_SERVICE_NAME not set"
        )
        return "config_missing", (
            "Set AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, and AZURE_APP_SERVICE_NAME "
            "environment variables on the App Service to enable automatic provisioning."
        )

    try:
        from azure.identity import DefaultAzureCredential
        from azure.mgmt.relay import RelayManagementClient
        from azure.mgmt.relay.models import HybridConnection
        from azure.mgmt.web import WebSiteManagementClient
        from azure.mgmt.web.models import HybridConnection as WebHybridConnection

        credential = DefaultAzureCredential()

        # ── 1. Create the Hybrid Connection entity in the Relay namespace ──────
        relay_client = RelayManagementClient(credential, subscription_id)

        relay_client.hybrid_connections.create_or_update(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            parameters=HybridConnection(
                requires_client_authorization=True,
            ),
        )
        logger.info("Relay HC entity '%s' created in namespace '%s'", name, namespace)

        # ── 2. Retrieve the relay send key (needed for App Service binding) ───
        keys = relay_client.hybrid_connections.list_keys(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            authorization_rule_name="defaultListener",
        )

        relay_arm_uri = (
            f"/subscriptions/{subscription_id}/resourceGroups/{resource_group}"
            f"/providers/Microsoft.Relay/namespaces/{namespace}"
            f"/hybridConnections/{name}"
        )

        # ── 3. Attach to App Service ───────────────────────────────────────────
        web_client = WebSiteManagementClient(credential, subscription_id)

        web_client.web_apps.create_or_update_hybrid_connection(
            resource_group_name=resource_group,
            name=app_service,
            namespace_name=namespace,
            relay_name=name,
            connection_envelope=WebHybridConnection(
                relay_arm_uri=relay_arm_uri,
                hostname=endpoint_host,
                port=endpoint_port,
                send_key_name="defaultSender",
                send_key_value=keys.primary_key,
            ),
        )
        logger.info(
            "Hybrid Connection '%s' attached to App Service '%s'", name, app_service
        )

        return "provisioned", None

    except Exception as exc:
        logger.warning("Hybrid Connection provisioning failed for '%s': %s", name, exc)
        return "error", str(exc)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=HybridConnectionResponse,
    summary="Create and auto-provision a Hybrid Connection",
)
async def create_hybrid_connection(
    body: CreateHybridConnectionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Saves the Hybrid Connection details for the logged-in user and
    immediately provisions it in Azure using the SDK (Managed Identity or
    service-principal credentials).

    Status values:
    - provisioned    : Azure relay entity created + App Service binding done
    - config_missing : env vars not configured on the server
    - error          : provisioning attempted but failed (detail in error_detail)
    """
    connection_id = str(uuid.uuid4())
    user_id       = current_user["user_id"]
    namespace     = _normalise_namespace(body.service_bus_namespace)

    # Run SDK provisioning in a thread so we don't block the event loop
    loop = asyncio.get_event_loop()
    status, error_detail = await loop.run_in_executor(
        None,
        _provision_hybrid_connection,
        body.name,
        body.endpoint_host,
        body.endpoint_port,
        namespace,
    )

    azure_store.create_hybrid_connection(
        connection_id=connection_id,
        user_id=user_id,
        name=body.name,
        endpoint_host=body.endpoint_host,
        endpoint_port=body.endpoint_port,
        service_bus_namespace=namespace,
        status=status,
    )

    logger.info(
        "User %s created Hybrid Connection '%s' (id=%s, status=%s)",
        user_id, body.name, connection_id, status,
    )

    return HybridConnectionResponse(
        connection_id=connection_id,
        name=body.name,
        endpoint_host=body.endpoint_host,
        endpoint_port=body.endpoint_port,
        service_bus_namespace=namespace,
        status=status,
        created_at=datetime.now(timezone.utc).isoformat(),
        error_detail=error_detail,
    )


@router.get(
    "",
    response_model=list[HybridConnectionResponse],
    summary="List Hybrid Connections for the current user",
)
async def list_hybrid_connections(current_user: dict = Depends(get_current_user)):
    rows = azure_store.list_hybrid_connections(user_id=current_user["user_id"])
    return [
        HybridConnectionResponse(
            connection_id=r["connection_id"],
            name=r["name"],
            endpoint_host=r["endpoint_host"],
            endpoint_port=r["endpoint_port"],
            service_bus_namespace=r["service_bus_namespace"],
            status=r["status"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.delete(
    "/{connection_id}",
    summary="Delete a Hybrid Connection (owner only)",
)
async def delete_hybrid_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
):
    deleted = azure_store.delete_hybrid_connection(
        connection_id=connection_id,
        user_id=current_user["user_id"],
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Hybrid connection not found.")
    return {"ok": True}
