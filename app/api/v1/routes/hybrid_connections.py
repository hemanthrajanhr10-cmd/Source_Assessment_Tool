"""
Hybrid Connections API routes.

POST   /api/v1/hybrid-connections           — create + auto-provision in Azure
GET    /api/v1/hybrid-connections           — list connections for the current user
DELETE /api/v1/hybrid-connections/{id}      — delete (owner only)

Auto-provisioning uses ManagedIdentityCredential (system-assigned on App Service),
or ClientSecretCredential when AZURE_CLIENT_ID + AZURE_CLIENT_SECRET + AZURE_TENANT_ID
are all set (service principal / local dev).

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
    name: str = Field(..., description="Hybrid connection name, e.g. sat-onprem-oracle")
    endpoint_host: str = Field(..., description="Database hostname or IP visible from the agent machine")
    endpoint_port: int = Field(1433, ge=1, le=65535, description="Database port (1433 for SQL Server, 1521 for Oracle)")


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


def _get_azure_credential():
    """
    Return an Azure credential, preferring Managed Identity on App Service.
    Falls back to explicit service principal env vars if MI is unavailable.
    Raises a clear RuntimeError with actionable fix instructions when neither works.
    """
    from azure.identity import (
        ChainedTokenCredential,
        ClientSecretCredential,
        ManagedIdentityCredential,
    )

    chain: list = []

    # Explicit user-assigned managed identity (AZURE_CLIENT_ID set to MI client id)
    client_id = os.environ.get("AZURE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("AZURE_CLIENT_SECRET", "").strip()
    tenant_id = os.environ.get("AZURE_TENANT_ID", "").strip()

    if client_id and client_secret and tenant_id:
        # Full service-principal credentials configured — use them directly.
        chain.append(ClientSecretCredential(tenant_id, client_id, client_secret))
        logger.debug("Azure credential: using ClientSecretCredential (service principal)")
    elif client_id:
        # AZURE_CLIENT_ID alone means user-assigned managed identity.
        chain.append(ManagedIdentityCredential(client_id=client_id))
        logger.debug("Azure credential: using user-assigned ManagedIdentityCredential (client_id=%s)", client_id)
    else:
        # System-assigned managed identity (default on App Service with MI enabled).
        chain.append(ManagedIdentityCredential())
        logger.debug("Azure credential: using system-assigned ManagedIdentityCredential")

    credential = ChainedTokenCredential(*chain)

    # Eagerly probe the credential so we get a useful error now rather than
    # a cryptic AuthenticationError deep inside an SDK call.
    try:
        credential.get_token("https://management.azure.com/.default")
    except Exception as probe_exc:
        subscription_id = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
        resource_group = os.environ.get("AZURE_RESOURCE_GROUP", "").strip()
        raise RuntimeError(
            "Azure authentication failed — the App Service cannot obtain a token. "
            "To fix this:\n"
            "  1. Azure Portal → App Service → Identity → System assigned → turn ON\n"
            f"  2. Resource Group ({resource_group or 'AZURE_RESOURCE_GROUP'}) → "
            "IAM → Add role assignment → Contributor → select the App Service identity\n"
            "  3. Verify App Service Configuration has AZURE_SUBSCRIPTION_ID="
            f"{subscription_id or '<missing>'} and AZURE_RESOURCE_GROUP="
            f"{resource_group or '<missing>'}\n"
            f"  (underlying error: {probe_exc})"
        ) from probe_exc

    return credential


def _wait_for_namespace_ready(
    relay_client,
    resource_group: str,
    namespace: str,
    max_wait_secs: int = 90,
    poll_interval: int = 5,
) -> None:
    """
    Azure ARM reports a namespace as 'Succeeded' before it is fully propagated
    internally.  Poll namespaces.get() until the call succeeds and the
    provisioning state is Succeeded — or raise after max_wait_secs.
    """
    import time

    deadline = time.monotonic() + max_wait_secs
    last_exc: Optional[Exception] = None
    while time.monotonic() < deadline:
        try:
            ns = relay_client.namespaces.get(resource_group, namespace)
            state = (ns.provisioning_state or "").lower()
            if state == "succeeded":
                return
            logger.debug("Namespace '%s' provisioning_state=%s, waiting…", namespace, state)
        except Exception as exc:
            last_exc = exc
            logger.debug("Namespace '%s' not yet reachable: %s", namespace, exc)
        time.sleep(poll_interval)
    raise RuntimeError(
        f"Namespace '{namespace}' not accessible after {max_wait_secs}s. "
        f"Last error: {last_exc}"
    )


def _ensure_user_namespace(
    user_id: str,
    subscription_id: str,
    resource_group: str,
) -> tuple[str, Optional[str]]:
    """
    Return (namespace_name, error_detail).
    If the user already has a namespace stored, verify it exists in Azure first.
    If not found (stale cache or never created), provision it and wait until ready.
    """
    from app.db import azure_store

    namespace = _namespace_name_for_user(user_id)
    location = os.environ.get("AZURE_RELAY_LOCATION", "eastus").strip()

    try:
        try:
            from azure.mgmt.relay import RelayAPI as _RelayClient
        except ImportError:
            from azure.mgmt.relay import RelayManagementClient as _RelayClient  # type: ignore[no-redef]

        from azure.mgmt.relay.models import RelayNamespace, Sku

        credential = _get_azure_credential()
        relay_client = _RelayClient(credential, subscription_id)

        existing = azure_store.get_user_relay_namespace(user_id)
        if existing:
            # Verify the cached namespace actually exists in Azure before trusting it.
            try:
                ns = relay_client.namespaces.get(resource_group, existing)
                state = (ns.provisioning_state or "").lower()
                if state == "succeeded":
                    logger.debug("Cached namespace '%s' verified in Azure.", existing)
                    return existing, None
                logger.warning(
                    "Cached namespace '%s' has provisioning_state=%s — re-provisioning.",
                    existing, state,
                )
            except Exception as verify_exc:
                logger.warning(
                    "Cached namespace '%s' not found in Azure (%s) — re-provisioning.",
                    existing, verify_exc,
                )
            # Clear stale cache and fall through to (re)provision.
            azure_store.set_user_relay_namespace(user_id, "")

        poller = relay_client.namespaces.begin_create_or_update(
            resource_group_name=resource_group,
            namespace_name=namespace,
            parameters=RelayNamespace(
                location=location,
                sku=Sku(name="Standard", tier="Standard"),
            ),
        )
        poller.result()  # wait for ARM LRO to complete

        # ARM says Succeeded, but internal propagation can still lag.
        # Poll until the namespace is actually reachable.
        _wait_for_namespace_ready(relay_client, resource_group, namespace)

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
        import json as _json
        import time

        from azure.mgmt.relay.models import AccessRights, AuthorizationRule, HybridConnection

        # azure-mgmt-relay 1.1.0 renamed the client to RelayAPI; fall back to
        # the old RelayManagementClient name found in 0.x releases.
        try:
            from azure.mgmt.relay import RelayAPI as _RelayClient
        except ImportError:
            from azure.mgmt.relay import RelayManagementClient as _RelayClient  # type: ignore[no-redef]

        credential = _get_azure_credential()
        relay_client = _RelayClient(credential, subscription_id)

        # ── 1. Create the Hybrid Connection entity in the Relay namespace ──────
        # Retry with backoff: Azure may report the namespace as ready before all
        # internal RP replicas have caught up, causing ParentResourceNotFound.
        _HC_CREATE_RETRIES = 4
        _HC_RETRY_DELAYS = [5, 10, 20]  # seconds between attempts

        endpoint_metadata = _json.dumps([{"key": "endpoint", "value": f"{endpoint_host}:{endpoint_port}"}])
        for _attempt in range(1, _HC_CREATE_RETRIES + 1):
            try:
                relay_client.hybrid_connections.create_or_update(
                    resource_group_name=resource_group,
                    namespace_name=namespace,
                    hybrid_connection_name=name,
                    parameters=HybridConnection(
                        requires_client_authorization=True,
                        user_metadata=endpoint_metadata,
                    ),
                )
                break  # success
            except Exception as _hc_exc:
                if "ParentResourceNotFound" in str(_hc_exc) and _attempt < _HC_CREATE_RETRIES:
                    _delay = _HC_RETRY_DELAYS[min(_attempt - 1, len(_HC_RETRY_DELAYS) - 1)]
                    logger.warning(
                        "ParentResourceNotFound creating HC '%s' in namespace '%s' "
                        "(attempt %d/%d) — waiting %ds before retry",
                        name, namespace, _attempt, _HC_CREATE_RETRIES, _delay,
                    )
                    time.sleep(_delay)
                else:
                    raise
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
        raise


def _deprovision_hybrid_connection(
    hc_name: str,
    namespace: str,
) -> Optional[str]:
    """
    Delete the Hybrid Connection from Azure Relay and detach it from the App
    Service (if AZURE_APP_SERVICE_NAME is set).

    Returns None on success, or an error string if something went wrong.
    Azure-side deletion failures are logged but do NOT block the local DB delete —
    the admin can clean up orphaned resources manually.
    """
    subscription_id = os.environ.get("AZURE_SUBSCRIPTION_ID", "").strip()
    resource_group  = os.environ.get("AZURE_RESOURCE_GROUP", "").strip()
    app_service     = os.environ.get("AZURE_APP_SERVICE_NAME", "").strip()

    if not subscription_id or not resource_group:
        # Nothing was ever provisioned in Azure (config_missing path), skip.
        return None

    errors: list[str] = []

    try:
        try:
            from azure.mgmt.relay import RelayAPI as _RelayClient
        except ImportError:
            from azure.mgmt.relay import RelayManagementClient as _RelayClient  # type: ignore[no-redef]

        credential = _get_azure_credential()
        relay_client = _RelayClient(credential, subscription_id)

        # ── 1. Detach from App Service first (must remove binding before HC entity) ─
        if app_service:
            try:
                from azure.mgmt.web import WebSiteManagementClient
                web_client = WebSiteManagementClient(credential, subscription_id)
                web_client.web_apps.delete_hybrid_connection(
                    resource_group_name=resource_group,
                    name=app_service,
                    namespace_name=namespace,
                    relay_name=hc_name,
                )
                logger.info(
                    "Detached HC '%s' from App Service '%s'", hc_name, app_service
                )
            except Exception as exc:
                # NotFound is fine — binding may already be gone.
                if "NotFound" not in str(exc) and "not found" not in str(exc).lower():
                    logger.warning(
                        "Failed to detach HC '%s' from App Service: %s", hc_name, exc
                    )
                    errors.append(f"App Service detach: {exc}")

        # ── 2. Delete the Relay HC entity (auth rules are deleted automatically) ──
        try:
            relay_client.hybrid_connections.delete(
                resource_group_name=resource_group,
                namespace_name=namespace,
                hybrid_connection_name=hc_name,
            )
            logger.info(
                "Deleted Relay HC entity '%s' from namespace '%s'", hc_name, namespace
            )
        except Exception as exc:
            if "NotFound" not in str(exc) and "not found" not in str(exc).lower():
                logger.warning(
                    "Failed to delete Relay HC entity '%s': %s", hc_name, exc
                )
                errors.append(f"Relay HC delete: {exc}")

    except Exception as exc:
        logger.warning(
            "Azure credential/client setup failed during HC deprovision for '%s': %s",
            hc_name, exc,
        )
        errors.append(str(exc))

    return "; ".join(errors) if errors else None


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

    # If namespace provisioning failed, do NOT attempt HC creation — the parent
    # namespace doesn't exist in Azure and the call would fail with ParentResourceNotFound.
    if ns_error:
        status = "error"
        listener_connection_string = None
        error_detail = f"Relay namespace could not be provisioned: {ns_error}"
    else:
        # Step 2: provision the Hybrid Connection entity inside that namespace.
        # If Azure returns ParentResourceNotFound it means the namespace was cached
        # locally but never actually created (or was deleted). Clear the cache,
        # re-provision the namespace, and retry once.
        try:
            status, listener_connection_string, error_detail = await loop.run_in_executor(
                None,
                _provision_hybrid_connection,
                body.name,
                body.endpoint_host,
                body.endpoint_port,
                namespace,
            )
        except Exception as exc:
            if "ParentResourceNotFound" in str(exc) and subscription_id and resource_group:
                logger.warning(
                    "ParentResourceNotFound for namespace '%s' — clearing cache and re-provisioning",
                    namespace,
                )
                azure_store.set_user_relay_namespace(user_id, "")  # clear stale cache
                namespace, ns_error = await loop.run_in_executor(
                    None,
                    _ensure_user_namespace,
                    user_id,
                    subscription_id,
                    resource_group,
                )
                if ns_error:
                    status = "error"
                    listener_connection_string = None
                    error_detail = f"Relay namespace re-provision failed: {ns_error}"
                else:
                    try:
                        status, listener_connection_string, error_detail = await loop.run_in_executor(
                            None,
                            _provision_hybrid_connection,
                            body.name,
                            body.endpoint_host,
                            body.endpoint_port,
                            namespace,
                        )
                    except Exception as retry_exc:
                        status = "error"
                        listener_connection_string = None
                        error_detail = str(retry_exc)
            else:
                status = "error"
                listener_connection_string = None
                error_detail = str(exc)

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
    user_id = current_user["user_id"]

    # Fetch the record first so we know what to clean up in Azure.
    record = azure_store.get_hybrid_connection(connection_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="Hybrid connection not found.")

    azure_error: Optional[str] = None

    # Only attempt Azure cleanup for connections that were actually provisioned.
    provisioned_statuses = {"provisioned", "provisioned_no_appservice"}
    if record.get("status") in provisioned_statuses:
        loop = asyncio.get_event_loop()
        azure_error = await loop.run_in_executor(
            None,
            _deprovision_hybrid_connection,
            record["name"],
            record["service_bus_namespace"],
        )
        if azure_error:
            logger.warning(
                "Azure cleanup had errors for HC '%s' (id=%s): %s",
                record["name"], connection_id, azure_error,
            )
        else:
            logger.info(
                "Azure resources for HC '%s' (id=%s) successfully removed.",
                record["name"], connection_id,
            )

    # Always remove the local DB record regardless of Azure outcome.
    azure_store.delete_hybrid_connection(connection_id, user_id)

    logger.info(
        "User %s deleted Hybrid Connection '%s' (id=%s)",
        user_id, record["name"], connection_id,
    )

    response: dict = {"ok": True}
    if azure_error:
        response["azure_warning"] = (
            "Local record removed, but Azure cleanup encountered errors: "
            + azure_error
        )
    return response
