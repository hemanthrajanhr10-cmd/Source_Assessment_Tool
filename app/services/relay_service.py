"""
Azure Relay Hybrid Connection sender — dispatches jobs to on-prem gateway agents.

Architecture:
  Agent (on-prem)  → listener WebSocket → Azure Relay ← sender WebSocket ← SAT Server
  Agent            → HTTP POST /api/v1/gateway/submit/{job_id} → SAT Server  (results)

The agent connects outbound to Azure Relay on port 443 (HTTPS/WSS).
No inbound ports are needed on the client network — works through VPNs and
corporate firewalls identically to HTTPS traffic.

Connection string format (from Azure Portal → Relay namespace → HC → Connection strings):
  Endpoint=sb://my-relay.servicebus.windows.net/;SharedAccessKeyName=...;SharedAccessKey=...;EntityPath=<hc-name>
"""

import asyncio
import base64
import hashlib
import hmac
import json
import time
import urllib.parse
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

# How long the server waits for the agent to accept the relay connection.
# If the agent is offline this will timeout after this many seconds.
_CONNECT_TIMEOUT_S = 20


# ── Utilities ─────────────────────────────────────────────────────────────────

def parse_conn_str(conn_str: str) -> tuple[str, str, str, str]:
    """
    Parse an Azure Relay / Service Bus connection string.
    Returns (namespace_host, key_name, key, entity_path).

    Example input:
        Endpoint=sb://my-relay.servicebus.windows.net/;
        SharedAccessKeyName=RootManageSharedAccessKey;
        SharedAccessKey=abc123=;
        EntityPath=sat-gateway-xyz
    """
    parts: dict[str, str] = {}
    for segment in conn_str.split(';'):
        if '=' in segment:
            k, v = segment.split('=', 1)
            parts[k.strip()] = v.strip()

    endpoint  = parts.get('Endpoint', '').replace('sb://', '').rstrip('/')
    key_name  = parts.get('SharedAccessKeyName', '')
    key       = parts.get('SharedAccessKey', '')
    entity    = parts.get('EntityPath', '')
    return endpoint, key_name, key, entity


def _sas_token(resource_uri: str, key_name: str, key: str, expiry_s: int = 3600) -> str:
    """
    Generate a Shared Access Signature token for Azure Relay.
    resource_uri: full HTTPS URI of the hybrid connection,
                  e.g. https://my-relay.servicebus.windows.net/sat-gateway-xyz
    """
    expiry = int(time.time() + expiry_s)
    encoded_uri = urllib.parse.quote_plus(resource_uri)
    string_to_sign = encoded_uri + '\n' + str(expiry)
    sig = base64.b64encode(
        hmac.new(key.encode('utf-8'), string_to_sign.encode('utf-8'), hashlib.sha256).digest()
    ).decode()
    return (
        f"SharedAccessSignature sr={encoded_uri}"
        f"&sig={urllib.parse.quote_plus(sig)}"
        f"&se={expiry}&skn={key_name}"
    )


def is_valid_conn_str(conn_str: str) -> bool:
    """Quick sanity check (no network call)."""
    if not conn_str:
        return False
    ns, kn, k, ep = parse_conn_str(conn_str)
    return bool(ns and kn and k and ep)


# ── Async sender ──────────────────────────────────────────────────────────────

async def _send_async(
    namespace: str,
    key_name: str,
    key: str,
    hc_path: str,
    job_id: str,
    payload: dict[str, Any],
) -> None:
    """
    Open a sender WebSocket connection to Azure Relay and deliver the job JSON.
    Azure Relay bridges this connection to whichever listener (agent) is connected
    on the same HC path, giving that agent the job data.

    Raises asyncio.TimeoutError if the agent is not listening.
    Raises RuntimeError on protocol / auth failures.
    """
    try:
        import websockets                          # type: ignore[import-untyped]
        import websockets.exceptions as _wse       # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError(
            "'websockets' package not installed on the server. "
            "Run: pip install 'websockets>=13'"
        )

    resource_uri = f"https://{namespace}/{hc_path}"
    token = _sas_token(resource_uri, key_name, key)

    # The sender action URL — Azure Relay forwards data to the listener
    ws_url = (
        f"wss://{namespace}/$hc/{hc_path}"
        f"?sb-hc-action=connect"
        f"&sb-hc-token={urllib.parse.quote(token)}"
    )

    message = json.dumps({"job_id": job_id, "payload": payload})

    try:
        async with asyncio.timeout(_CONNECT_TIMEOUT_S):
            async with websockets.connect(ws_url) as ws:
                await ws.send(message)
                logger.info(
                    "Relay: job %s dispatched → namespace=%s hc=%s",
                    job_id, namespace, hc_path,
                )
    except asyncio.TimeoutError:
        raise asyncio.TimeoutError()   # re-raise; caller wraps into friendly message
    except Exception as exc:
        raise RuntimeError(f"Azure Relay send error: {exc}") from exc


# ── Public async API (for FastAPI routes) ─────────────────────────────────────

async def send_job(conn_str: str, job_id: str, payload: dict[str, Any]) -> None:
    """
    Dispatch a job to the on-prem gateway agent via Azure Relay Hybrid Connection.

    conn_str : relay connection string including EntityPath=<hc-name>
    job_id   : the SAT job UUID
    payload  : dict with connection params and assessment options

    Raises:
        RuntimeError  — invalid connection string or relay protocol error
        asyncio.TimeoutError — agent is not currently listening (offline)
    """
    namespace, key_name, key, entity = parse_conn_str(conn_str)

    if not namespace:
        raise RuntimeError(
            "Relay connection string is missing 'Endpoint'. "
            "Expected format: Endpoint=sb://<namespace>.servicebus.windows.net/;..."
        )
    if not key_name or not key:
        raise RuntimeError(
            "Relay connection string is missing SharedAccessKeyName or SharedAccessKey."
        )
    if not entity:
        raise RuntimeError(
            "Relay connection string must include 'EntityPath=<hybrid-connection-name>'. "
            "Get this from Azure Portal → Relay namespace → Hybrid Connections → "
            "your connection → Shared access policies → Connection string."
        )

    try:
        await _send_async(namespace, key_name, key, entity, job_id, payload)
    except asyncio.TimeoutError:
        raise RuntimeError(
            f"Gateway agent did not accept the relay connection within {_CONNECT_TIMEOUT_S}s. "
            "Make sure the agent is running and connected to Azure Relay."
        )
