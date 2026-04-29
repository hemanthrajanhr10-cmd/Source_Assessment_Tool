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


class HybridConnectionResponse(BaseModel):
    connection_id: str
    name: str
    endpoint_host: str
    endpoint_port: int
    service_bus_namespace: str
    status: str
    created_at: str
    listener_connection_string: Optional[str] = None
    error_detail: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _namespace_name_for_user(user_id: str) -> str:
    """
    Derive a deterministic, globally-unique Azure Relay namespace name for a user.
    Format: sat-<first 16 hex chars of user_id without hyphens>
    Example: sat-539798273605476f  (20 chars — well within the 6-50 limit)
    """
    hex_id = user_id.replace("-", "")[:16]
    return f"sat-{hex_id}"


def _ensure_user_namespace(
    user_id: str,
    subscription_id: str,
    resource_group: str,
) -> tuple[str, Optional[str]]:
    """
    Return (namespace_name, error_detail).
    If the user already has a namespace stored, return it immediately.
    Otherwise, provision a new one in Azure and persist it.
    """
    from app.db import azure_store

    existing = azure_store.get_user_relay_namespace(user_id)
    if existing:
        return existing, None

    namespace = _namespace_name_for_user(user_id)
    location = os.environ.get("AZURE_RELAY_LOCATION", "eastus").strip()

    try:
        from azure.identity import DefaultAzureCredential

        try:
            from azure.mgmt.relay import RelayAPI as _RelayClient
        except ImportError:
            from azure.mgmt.relay import RelayManagementClient as _RelayClient  # type: ignore[no-redef]

        from azure.mgmt.relay.models import RelayNamespace, Sku

        credential = DefaultAzureCredential()
        relay_client = _RelayClient(credential, subscription_id)

        poller = relay_client.namespaces.begin_create_or_update(
            resource_group_name=resource_group,
            namespace_name=namespace,
            parameters=RelayNamespace(
                location=location,
                sku=Sku(name="Standard", tier="Standard"),
            ),
        )
        poller.result()  # wait for provisioning to complete

        azure_store.set_user_relay_namespace(user_id, namespace)
        logger.info("Provisioned Relay namespace '%s' for user %s", namespace, user_id)
        return namespace, None

    except Exception as exc:
        logger.warning(
            "Failed to provision Relay namespace '%s' for user %s: %s",
            namespace, user_id, exc,
        )
        return namespace, str(exc)


def _provision_hybrid_connection(
    name: str,
    endpoint_host: str,
    endpoint_port: int,
    namespace: str,
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Use the Azure SDK to:
      1. Create the Relay Hybrid Connection entity in the given namespace.
      2. Create defaultListener (Listen) and defaultSender (Send) auth rules.
      3. Fetch connection strings.
      4. Attach to the App Service (only if AZURE_APP_SERVICE_NAME is set).

    Returns (status, listener_connection_string, error_detail).
    status is one of: 'provisioned' | 'provisioned_no_appservice' | 'config_missing' | 'error'
    """
    subscription_id = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
    resource_group  = os.environ.get("AZURE_RESOURCE_GROUP", "").strip()
    app_service     = os.environ.get("AZURE_APP_SERVICE_NAME", "").strip()

    # Relay operations require at minimum subscription_id + resource_group.
    if not subscription_id or not resource_group:
        logger.info(
            "Hybrid Connection auto-provision skipped: "
            "AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP not set"
        )
        return "config_missing", None, (
            "Set AZURE_SUBSCRIPTION_ID and AZURE_RESOURCE_GROUP "
            "environment variables on the App Service to enable automatic provisioning."
        )

    try:
        from azure.identity import DefaultAzureCredential
        from azure.mgmt.relay.models import AccessRights, AuthorizationRule, HybridConnection

        # azure-mgmt-relay 1.1.0 renamed the client to RelayAPI; fall back to
        # the old RelayManagementClient name found in 0.x releases.
        try:
            from azure.mgmt.relay import RelayAPI as _RelayClient
        except ImportError:
            from azure.mgmt.relay import RelayManagementClient as _RelayClient  # type: ignore[no-redef]

        credential = DefaultAzureCredential()
        relay_client = _RelayClient(credential, subscription_id)

        # ── 1. Create the Hybrid Connection entity in the Relay namespace ──────
        relay_client.hybrid_connections.create_or_update(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            parameters=HybridConnection(
                requires_client_authorization=True,
            ),
        )
        logger.info("Relay HC entity '%s' created in namespace '%s'", name, namespace)

        # ── 2. Create authorization rules (Listen for HCM, Send for App Service) ─
        relay_client.hybrid_connections.create_or_update_authorization_rule(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            authorization_rule_name="defaultListener",
            parameters=AuthorizationRule(rights=[AccessRights.LISTEN]),
        )
        relay_client.hybrid_connections.create_or_update_authorization_rule(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            authorization_rule_name="defaultSender",
            parameters=AuthorizationRule(rights=[AccessRights.SEND]),
        )
        logger.info("Authorization rules created for HC '%s'", name)

        # ── 3. Fetch keys — listener string goes to the user; send key binds App Service ─
        listener_keys = relay_client.hybrid_connections.list_keys(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            authorization_rule_name="defaultListener",
        )
        sender_keys = relay_client.hybrid_connections.list_keys(
            resource_group_name=resource_group,
            namespace_name=namespace,
            hybrid_connection_name=name,
            authorization_rule_name="defaultSender",
        )
        listener_connection_string = listener_keys.primary_connection_string

        # ── 4. Attach to App Service (optional — skipped if AZURE_APP_SERVICE_NAME not set) ─
        if not app_service:
            logger.info(
                "HC '%s' provisioned in Relay; App Service attachment skipped "
                "(AZURE_APP_SERVICE_NAME not set)",
                name,
            )
            return "provisioned_no_appservice", listener_connection_string, (
                "Hybrid Connection created in Azure Relay. "
                "Set AZURE_APP_SERVICE_NAME to also bind it to the App Service."
            )

        relay_arm_uri = (
            f"/subscriptions/{subscription_id}/resourceGroups/{resource_group}"
            f"/providers/Microsoft.Relay/namespaces/{namespace}"
            f"/hybridConnections/{name}"
        )

        from azure.mgmt.web import WebSiteManagementClient
        from azure.mgmt.web.models import HybridConnection as WebHybridConnection

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
                send_key_value=sender_keys.primary_key,
            ),
        )
        logger.info(
            "Hybrid Connection '%s' attached to App Service '%s'", name, app_service
        )

        return "provisioned", listener_connection_string, None

    except Exception as exc:
        logger.warning("Hybrid Connection provisioning failed for '%s': %s", name, exc)
        return "error", None, str(exc)


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
    connection_id    = str(uuid.uuid4())
    user_id          = current_user["user_id"]
    subscription_id  = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
    resource_group   = os.environ.get("AZURE_RESOURCE_GROUP", "").strip()

    loop = asyncio.get_event_loop()

    # Step 1: ensure the user has a dedicated Relay namespace (provisioned once)
    if subscription_id and resource_group:
        namespace, ns_error = await loop.run_in_executor(
            None,
            _ensure_user_namespace,
            user_id,
            subscription_id,
            resource_group,
        )
    else:
        namespace = _namespace_name_for_user(user_id)
        ns_error = None

    # Step 2: provision the Hybrid Connection entity inside that namespace
    status, listener_connection_string, error_detail = await loop.run_in_executor(
        None,
        _provision_hybrid_connection,
        body.name,
        body.endpoint_host,
        body.endpoint_port,
        namespace,
    )

    if ns_error and error_detail is None:
        error_detail = ns_error

    azure_store.create_hybrid_connection(
        connection_id=connection_id,
        user_id=user_id,
        name=body.name,
        endpoint_host=body.endpoint_host,
        endpoint_port=body.endpoint_port,
        service_bus_namespace=namespace,
        status=status,
        listener_connection_string=listener_connection_string,
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
        listener_connection_string=listener_connection_string,
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
            listener_connection_string=r.get("listener_connection_string"),
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
