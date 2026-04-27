"""
Hybrid Connections API routes.

Allows authenticated users to register Azure Hybrid Connection details,
list their own connections, and delete them.

POST   /api/v1/hybrid-connections           — create a new record (+ optional CLI provisioning)
GET    /api/v1/hybrid-connections           — list connections for the current user
DELETE /api/v1/hybrid-connections/{id}      — delete a connection (owner only)
POST   /api/v1/hybrid-connections/{id}/test — test TCP reachability via the relay endpoint
"""

import asyncio
import shutil
import subprocess
import uuid
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
    service_bus_namespace: str = Field(..., description="Service Bus namespace, e.g. myns or myns.servicebus.windows.net")


class HybridConnectionResponse(BaseModel):
    connection_id: str
    name: str
    endpoint_host: str
    endpoint_port: int
    service_bus_namespace: str
    status: str
    created_at: str
    cli_commands: Optional[list[str]] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalise_namespace(ns: str) -> str:
    """Strip the .servicebus.windows.net suffix if present — store just the short name."""
    return ns.replace(".servicebus.windows.net", "").strip()


def _build_cli_commands(name: str, endpoint_host: str, endpoint_port: int, namespace: str) -> list[str]:
    """Return the Azure CLI commands the user (or CI) can run to provision the HC."""
    return [
        "# 1. Create the Relay Hybrid Connection entity",
        f"az relay hyco create \\",
        f"  --resource-group <YOUR_RESOURCE_GROUP> \\",
        f"  --namespace-name {namespace} \\",
        f"  --name {name} \\",
        f"  --requires-client-authorization true",
        "",
        "# 2. Attach it to the App Service",
        f"az webapp hybrid-connection add \\",
        f"  --resource-group <YOUR_RESOURCE_GROUP> \\",
        f"  --name <YOUR_APP_SERVICE_NAME> \\",
        f"  --namespace {namespace} \\",
        f"  --hybrid-connection {name}",
        "",
        "# 3. (On your laptop) install HCM, then add the connection via the HCM UI",
        f"# Endpoint that HCM must forward: {endpoint_host}:{endpoint_port}",
    ]


def _try_cli_provision(name: str, namespace: str) -> str:
    """
    Attempt to run az CLI to provision the Hybrid Connection.
    Returns 'provisioned' on success, 'cli_unavailable' if az is not installed,
    or 'cli_error' if the command fails.

    Requires AZURE_RESOURCE_GROUP and AZURE_APP_SERVICE_NAME environment variables.
    """
    import os
    if not shutil.which("az"):
        logger.info("az CLI not found — skipping auto-provision for HC '%s'", name)
        return "cli_unavailable"

    rg = os.environ.get("AZURE_RESOURCE_GROUP", "")
    app = os.environ.get("AZURE_APP_SERVICE_NAME", "")
    if not rg or not app:
        logger.info("AZURE_RESOURCE_GROUP/AZURE_APP_SERVICE_NAME not set — skipping auto-provision")
        return "cli_unavailable"

    try:
        # Create relay hybrid connection entity
        subprocess.run(
            ["az", "relay", "hyco", "create",
             "--resource-group", rg,
             "--namespace-name", namespace,
             "--name", name,
             "--requires-client-authorization", "true"],
            check=True, capture_output=True, text=True, timeout=60,
        )
        # Attach to App Service
        subprocess.run(
            ["az", "webapp", "hybrid-connection", "add",
             "--resource-group", rg,
             "--name", app,
             "--namespace", namespace,
             "--hybrid-connection", name],
            check=True, capture_output=True, text=True, timeout=60,
        )
        logger.info("Auto-provisioned Hybrid Connection '%s' via az CLI", name)
        return "provisioned"
    except subprocess.CalledProcessError as exc:
        logger.warning("az CLI provisioning failed for HC '%s': %s", name, exc.stderr)
        return "cli_error"
    except Exception as exc:
        logger.warning("az CLI provisioning exception for HC '%s': %s", name, exc)
        return "cli_error"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=HybridConnectionResponse,
    summary="Create a Hybrid Connection record",
)
async def create_hybrid_connection(
    body: CreateHybridConnectionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Stores the hybrid connection details for the logged-in user.
    If the Azure CLI is configured on the server (AZURE_RESOURCE_GROUP +
    AZURE_APP_SERVICE_NAME env vars and `az` in PATH), the relay entity and
    App-Service binding are provisioned automatically.
    Otherwise the connection is saved with status='created' and the CLI
    commands to run manually are returned in the response.
    """
    connection_id = str(uuid.uuid4())
    user_id = current_user["user_id"]
    namespace = _normalise_namespace(body.service_bus_namespace)

    # Attempt CLI provisioning in a thread (non-blocking for the request)
    loop = asyncio.get_event_loop()
    status = await loop.run_in_executor(
        None, _try_cli_provision, body.name, namespace
    )

    azure_store.create_hybrid_connection(
        connection_id=connection_id,
        user_id=user_id,
        name=body.name,
        endpoint_host=body.endpoint_host,
        endpoint_port=body.endpoint_port,
        service_bus_namespace=namespace,
        status=status if status == "provisioned" else "created",
    )

    logger.info(
        "User %s created Hybrid Connection '%s' (id=%s, status=%s)",
        user_id, body.name, connection_id, status,
    )

    cli_commands = None if status == "provisioned" else _build_cli_commands(
        body.name, body.endpoint_host, body.endpoint_port, namespace
    )

    return HybridConnectionResponse(
        connection_id=connection_id,
        name=body.name,
        endpoint_host=body.endpoint_host,
        endpoint_port=body.endpoint_port,
        service_bus_namespace=namespace,
        status=status if status == "provisioned" else "created",
        created_at="",   # will be set by DB default; returned from list endpoint
        cli_commands=cli_commands,
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
