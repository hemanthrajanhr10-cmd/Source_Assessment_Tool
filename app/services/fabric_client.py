"""
Async Fabric / Power BI API client.

All blocking HTTP calls are run inside a ThreadPoolExecutor so they never
block the asyncio event loop.  LRO polling follows the standard Fabric pattern:
  POST → 202 Accepted → poll Location header → GET /result on success.

Retry logic:
  - 429 Too Many Requests → wait Retry-After (up to 3 retries)
  - 5xx               → raise immediately
"""

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests

from app.core.logging import get_logger

logger = get_logger(__name__)

_EXECUTOR = ThreadPoolExecutor(max_workers=20, thread_name_prefix="fabric-io")

FABRIC_BASE = "https://api.fabric.microsoft.com/v1"
PBI_BASE = "https://api.powerbi.com/v1.0/myorg"

MAX_WAIT_SEC = 180
MAX_RETRIES = 3


# ── Low-level blocking helpers ────────────────────────────────────────────────

def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _http_get(url: str, token: str, retries: int = MAX_RETRIES) -> requests.Response:
    """Blocking GET with 429-retry logic."""
    headers = _headers(token)
    for attempt in range(retries + 1):
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 10))
            logger.warning("429 on GET %s — waiting %ds (attempt %d)", url, wait, attempt)
            if attempt < retries:
                time.sleep(wait)
                continue
        return resp
    return resp  # final attempt result


def _http_post(url: str, token: str, params: dict | None = None, retries: int = MAX_RETRIES) -> requests.Response:
    """Blocking POST with 429-retry logic."""
    headers = _headers(token)
    for attempt in range(retries + 1):
        resp = requests.post(url, headers=headers, params=params, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 10))
            logger.warning("429 on POST %s — waiting %ds (attempt %d)", url, wait, attempt)
            if attempt < retries:
                time.sleep(wait)
                continue
        return resp
    return resp


def _lro_fetch(token: str, trigger_url: str, params: dict | None = None) -> list[dict]:
    """
    Blocking LRO: POST → poll → decode base64 parts.
    Returns the raw parts list (path + payload).
    Raises RuntimeError on permanent failure, TimeoutError on timeout.
    """
    resp = _http_post(trigger_url, token, params=params)

    if resp.status_code == 200:
        result = resp.json()

    elif resp.status_code == 202:
        operation_url = resp.headers.get("Location")
        retry_after = int(resp.headers.get("Retry-After", 5))
        if not operation_url:
            raise RuntimeError("202 returned but no Location header")

        elapsed = 0
        result = None
        while elapsed < MAX_WAIT_SEC:
            time.sleep(retry_after)
            elapsed += retry_after

            poll_resp = _http_get(operation_url, token)
            if poll_resp.status_code == 200:
                try:
                    poll_body = poll_resp.json()
                except Exception:
                    poll_body = {}

                status = poll_body.get("status", "").lower()
                if status == "succeeded":
                    result_url = (
                        poll_body.get("resourceLocation")
                        or operation_url.rstrip("/") + "/result"
                    )
                    final = _http_get(result_url, token)
                    if not final.ok:
                        raise RuntimeError(
                            f"Result fetch failed ({final.status_code}): {final.text[:200]}"
                        )
                    result = final.json()
                    break

                elif status in ("", "notstarted"):
                    # Direct payload
                    result = poll_body
                    break

                elif status == "failed":
                    err = poll_body.get("error", {})
                    msg = err.get("message", str(poll_body))
                    raise RuntimeError(f"LRO failed: {msg}")

                elif status in ("running", "inprogress"):
                    retry_after = int(poll_resp.headers.get("Retry-After", retry_after))

                else:
                    logger.warning("Unknown LRO status '%s' — treating as running", status)
                    retry_after = int(poll_resp.headers.get("Retry-After", retry_after))

            elif poll_resp.status_code == 202:
                retry_after = int(poll_resp.headers.get("Retry-After", retry_after))

            elif poll_resp.status_code >= 500:
                raise RuntimeError(
                    f"Fabric API 5xx on poll ({poll_resp.status_code}): {poll_resp.text[:200]}"
                )
            else:
                logger.warning("Unexpected poll status %d — retrying", poll_resp.status_code)
                retry_after = 10

        if result is None:
            raise TimeoutError(f"LRO did not complete within {MAX_WAIT_SEC}s")

    elif resp.status_code >= 500:
        raise RuntimeError(
            f"Fabric API 5xx ({resp.status_code}): {resp.text[:200]}"
        )
    else:
        raise RuntimeError(
            f"Trigger failed ({resp.status_code}): {resp.text[:400]}"
        )

    definition = result.get("definition", result)
    return definition.get("parts", [])


async def _run(fn, *args):
    """Run a blocking function in the shared executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_EXECUTOR, fn, *args)


# ── Extraction ────────────────────────────────────────────────────────────────

async def extract_semantic_model(
    token: str, workspace_id: str, model_id: str, fmt: str = "TMDL"
) -> list[dict]:
    """Async: fetch TMDL/TMSL definition parts for a semantic model."""
    url = f"{FABRIC_BASE}/workspaces/{workspace_id}/semanticModels/{model_id}/getDefinition"

    def _fetch():
        return _lro_fetch(token, url, params={"format": fmt})

    return await _run(_fetch)


async def extract_report(
    token: str, workspace_id: str, report_id: str
) -> list[dict]:
    """Async: fetch report definition parts."""
    url = f"{FABRIC_BASE}/workspaces/{workspace_id}/reports/{report_id}/getDefinition"

    def _fetch():
        return _lro_fetch(token, url)

    return await _run(_fetch)


# ── Workspace / item listing ──────────────────────────────────────────────────

def _get_all_pages(url: str, token: str) -> list[dict]:
    """Blocking: follow @odata.nextLink pagination."""
    results: list[dict] = []
    next_url: str | None = url
    while next_url:
        resp = _http_get(next_url, token)
        if not resp.ok:
            logger.warning("Listing failed (%d): %s", resp.status_code, resp.text[:200])
            break
        body = resp.json()
        results.extend(body.get("value", []))
        next_url = body.get("@odata.nextLink") or body.get("continuationUri")
    return results


async def list_workspaces(token: str) -> list[dict]:
    """
    Return workspace list from Fabric API, enriched with dataset/report counts
    from Power BI API (falls back to Fabric counts on failure).
    """
    def _fetch():
        # Use Fabric API for workspace list (supports fabric_client_id scope)
        fabric_ws = _get_all_pages(f"{FABRIC_BASE}/workspaces", token)
        result = []
        for ws in fabric_ws:
            # Only include actual workspaces (not personal/admin workspaces of wrong type)
            ws_type = ws.get("type", "Workspace")
            result.append({
                "id": ws.get("id", ""),
                "name": ws.get("displayName", ws.get("name", "")),
                "type": ws_type,
                "state": ws.get("state", "Active"),
                "capacity_id": ws.get("capacityId", ""),
                "dataset_count": 0,  # enriched below
                "report_count": 0,
            })
        return result

    workspaces = await _run(_fetch)

    # Enrich counts in parallel
    async def _enrich(ws: dict):
        ws_id = ws["id"]
        try:
            models, reports = await asyncio.gather(
                list_workspace_semantic_models(token, ws_id),
                list_workspace_reports(token, ws_id),
            )
            ws["dataset_count"] = len(models)
            ws["report_count"] = len(reports)
        except Exception:
            pass
        return ws

    enriched = await asyncio.gather(*[_enrich(ws) for ws in workspaces])
    return list(enriched)


async def list_workspace_semantic_models(token: str, workspace_id: str) -> list[dict]:
    """Return semantic models in a workspace via Fabric API."""
    def _fetch():
        return _get_all_pages(
            f"{FABRIC_BASE}/workspaces/{workspace_id}/semanticModels", token
        )
    return await _run(_fetch)


async def list_workspace_reports(token: str, workspace_id: str) -> list[dict]:
    """Return reports in a workspace via Fabric API."""
    def _fetch():
        return _get_all_pages(
            f"{FABRIC_BASE}/workspaces/{workspace_id}/reports", token
        )
    return await _run(_fetch)


async def get_dataset_metadata(token: str, workspace_id: str, dataset_id: str) -> dict[str, Any]:
    """
    Fetch rich dataset metadata from Power BI API.
    Falls back to empty dict on 403/404 (no Power BI access with this token).
    """
    def _fetch():
        url = f"{PBI_BASE}/groups/{workspace_id}/datasets/{dataset_id}"
        resp = _http_get(url, token)
        if resp.ok:
            return resp.json()
        return {}

    raw = await _run(_fetch)
    return {
        "configured_by": raw.get("configuredBy", ""),
        "is_refreshable": raw.get("isRefreshable", False),
        "storage_mode": raw.get("targetStorageMode") or raw.get("defaultMode") or "Import",
        "web_url": raw.get("webUrl", ""),
    }


async def get_report_metadata(token: str, workspace_id: str, report_id: str) -> dict[str, Any]:
    """
    Fetch report metadata from Power BI API.
    Falls back to empty dict on failure.
    """
    def _fetch():
        url = f"{PBI_BASE}/groups/{workspace_id}/reports/{report_id}"
        resp = _http_get(url, token)
        if resp.ok:
            return resp.json()
        return {}

    raw = await _run(_fetch)
    return {
        "name": raw.get("name", ""),
        "report_type": raw.get("reportType", "PowerBIReport"),
        "is_paginated": raw.get("reportType", "") == "PaginatedReport",
        "dataset_id": raw.get("datasetId", ""),
        "web_url": raw.get("webUrl", ""),
    }
