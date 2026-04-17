"""
Microsoft Fabric / Power BI Workspace Assessment Service.

Auth  : DeviceCodeCredential (azure-identity) — user visits aka.ms/devicelogin
        Works in cloud (Azure App Service) and local environments.
        Token cached inside the credential; re-acquired automatically on expiry.

API   : Power BI REST API  (api.powerbi.com/v1.0/myorg/)
DMV   : executeQueries endpoint → TMSCHEMA_* system catalog views
        Yields: tables, measures, calculated tables, calculated columns, storage modes.
        Note: Fabric Lakehouses / Warehouses do NOT support executeQueries (400).
              On first 400 for a dataset, all remaining DMV queries are skipped.
"""

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from azure.identity import DeviceCodeCredential

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

PBI_BASE  = "https://api.powerbi.com/v1.0/myorg"
PBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default"

_STORAGE_MODE = {0: "Import", 1: "DirectQuery", 2: "Push", 3: "Composite", 4: "DirectLake"}

# Sentinel returned by _dmv_query when the dataset does not support executeQueries (HTTP 400).
# This tells _get_dataset_details to bail out immediately rather than fire more queries.
_DMV_NOT_SUPPORTED: list = None  # type: ignore[assignment]

# Internal PBI usage-metric model names to skip during assessment
_SKIP_MODEL_NAMES = frozenset({
    "Report Usage Metrics Model",
    "Dashboard Usage Metrics Model",
    "Usage Metrics Report",
})

# ── In-memory auth registry ───────────────────────────────────────────────────
# auth_id → {status, credential, token, user_code, verification_url, expires_at, error}
_auth: dict[str, dict] = {}
_auth_lock = threading.Lock()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def start_device_auth() -> dict[str, str]:
    """
    Start a device-code authentication flow.
    Returns {auth_id, user_code, verification_url, expires_at} immediately once
    the device code is issued. Token acquisition runs in a background thread.
    """
    auth_id = str(uuid.uuid4())
    entry: dict[str, Any] = {
        "status": "starting",
        "credential": None,
        "token": None,
        "user_code": None,
        "verification_url": None,
        "expires_at": None,
        "error": None,
    }
    with _auth_lock:
        _auth[auth_id] = entry

    # Synchronisation: background thread signals when device code is ready
    code_ready = threading.Event()

    def _prompt_callback(verification_uri: str, user_code: str, expires_on: datetime):
        with _auth_lock:
            _auth[auth_id].update({
                "status": "pending",
                "user_code": user_code,
                "verification_url": verification_uri,
                "expires_at": expires_on.isoformat() if expires_on else None,
            })
        code_ready.set()  # unblock the caller

    def _acquire_token():
        try:
            cred = DeviceCodeCredential(
                client_id=settings.fabric_client_id or _FALLBACK_CLIENT_ID,
                tenant_id=settings.fabric_tenant_id or "common",
                prompt_callback=_prompt_callback,
            )
            tok = cred.get_token(PBI_SCOPE)
            with _auth_lock:
                _auth[auth_id].update({
                    "status": "ready",
                    "credential": cred,
                    "token": tok.token,
                })
            logger.info("Fabric device auth completed for auth_id=%s", auth_id)
        except Exception as exc:
            logger.error("Fabric device auth failed for auth_id=%s: %s", auth_id, exc)
            with _auth_lock:
                _auth[auth_id].update({"status": "error", "error": str(exc)})
            code_ready.set()

    threading.Thread(target=_acquire_token, daemon=True, name=f"fabric-auth-{auth_id}").start()

    # Wait up to 15 s for the device code to be issued
    code_ready.wait(timeout=15)

    with _auth_lock:
        snap = dict(_auth[auth_id])

    if snap["status"] == "error":
        raise RuntimeError(snap["error"] or "Device code auth failed")

    return {
        "auth_id": auth_id,
        "user_code": snap["user_code"] or "",
        "verification_url": snap["verification_url"] or "https://microsoft.com/devicelogin",
        "expires_at": snap["expires_at"] or "",
    }


def get_auth_status(auth_id: str) -> dict[str, str]:
    with _auth_lock:
        entry = _auth.get(auth_id)
    if not entry:
        return {"status": "not_found"}
    return {"status": entry["status"], "error": entry.get("error") or ""}


def _get_token(auth_id: str) -> str:
    """Return a fresh token for the auth session; raises if not ready."""
    with _auth_lock:
        entry = _auth.get(auth_id)
    if not entry or entry["status"] != "ready":
        raise RuntimeError("Fabric auth not ready")
    # Refresh if needed
    cred: DeviceCodeCredential = entry["credential"]
    tok = cred.get_token(PBI_SCOPE)
    with _auth_lock:
        _auth[auth_id]["token"] = tok.token
    return tok.token


# Well-known public client that supports device code flow for Power BI
_FALLBACK_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"  # Azure CLI client


# ── REST API helpers ──────────────────────────────────────────────────────────

def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _pbi_get(token: str, path: str) -> Any:
    resp = requests.get(f"{PBI_BASE}{path}", headers=_headers(token), timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        return data.get("value", data)
    logger.warning("PBI GET %s → %s", path, resp.status_code)
    return []


def _dmv_query(token: str, group_id: str, dataset_id: str, query: str) -> Optional[list[dict]]:
    """
    Execute a DMV/DAX query against a dataset via the executeQueries endpoint.

    Returns:
      list[dict]  — rows from the first result table
      []          — query succeeded but returned no rows, OR a 403 (no permission)
      None        — dataset does NOT support executeQueries (HTTP 400).
                    Caller should skip all further DMV queries for this dataset.
    """
    url = f"{PBI_BASE}/groups/{group_id}/datasets/{dataset_id}/executeQueries"
    body = {"queries": [{"query": query}], "serializerSettings": {"includeNulls": True}}
    try:
        resp = requests.post(url, headers=_headers(token), json=body, timeout=60)
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            if results:
                tables = results[0].get("tables", [])
                if tables:
                    return tables[0].get("rows", [])
            return []
        elif resp.status_code == 400:
            # Dataset type does not support executeQueries
            # (Fabric Lakehouse, Warehouse, Push dataset, etc.)
            logger.debug("DMV not supported (400) for dataset %s — skipping", dataset_id)
            return None   # ← sentinel: caller must short-circuit
        elif resp.status_code == 403:
            logger.debug("DMV blocked (no permission) for dataset %s", dataset_id)
            return []
        else:
            logger.warning("DMV query failed (%s) for dataset %s", resp.status_code, dataset_id)
    except Exception as exc:
        logger.warning("DMV query exception for dataset %s: %s", dataset_id, exc)
    return []


# ── Dataset complexity via DMV ────────────────────────────────────────────────

def _empty_details() -> dict:
    return {
        "tables": [], "measures": [], "calculated_columns": [], "calculated_tables": [],
        "complexity_score": 0, "table_count": 0, "measure_count": 0,
        "calculated_column_count": 0, "calculated_table_count": 0,
        "dmv_supported": False,
    }


def _get_dataset_details(token: str, group_id: str, dataset_id: str) -> dict:
    """
    Collect tables, measures, calculated tables, and calculated columns
    for a semantic model using TMSCHEMA_* catalog views.

    If the dataset does not support executeQueries (Fabric Lakehouse, Warehouse,
    push datasets, etc.) the first query returns None and we return immediately
    with empty lists — no further queries are fired.
    """
    # Tables + storage modes — first probe; bail out immediately on 400
    raw_tables = _dmv_query(
        token, group_id, dataset_id,
        "SELECT [Name], [StorageMode], [IsHidden] FROM $SYSTEM.TMSCHEMA_TABLES"
    )
    if raw_tables is None:
        # Dataset does not support executeQueries at all — return empty, skip rest
        return _empty_details()

    tables = [
        {
            "name": r.get("[Name]") or r.get("Name", ""),
            "storage_mode": _STORAGE_MODE.get(
                int(r.get("[StorageMode]") or r.get("StorageMode") or 0), "Import"
            ),
            "is_hidden": bool(r.get("[IsHidden]") or r.get("IsHidden")),
        }
        for r in raw_tables
    ]

    # Measures
    raw_measures = _dmv_query(
        token, group_id, dataset_id,
        "SELECT [Name], [TableID], [Expression], [DisplayFolder] FROM $SYSTEM.TMSCHEMA_MEASURES"
    )
    measures = [
        {
            "name": r.get("[Name]") or r.get("Name", ""),
            "expression": r.get("[Expression]") or r.get("Expression", ""),
            "display_folder": r.get("[DisplayFolder]") or r.get("DisplayFolder", ""),
        }
        for r in (raw_measures or [])
    ]

    # Calculated columns (Type = 2)
    raw_calc_cols = _dmv_query(
        token, group_id, dataset_id,
        "SELECT [Name], [TableID], [Expression] FROM $SYSTEM.TMSCHEMA_COLUMNS WHERE [Type] = 2"
    )
    calc_columns = [
        {
            "name": r.get("[Name]") or r.get("Name", ""),
            "expression": r.get("[Expression]") or r.get("Expression", ""),
        }
        for r in (raw_calc_cols or [])
    ]

    # Calculated tables
    raw_calc_tables = _dmv_query(
        token, group_id, dataset_id,
        "SELECT [Name], [Expression] FROM $SYSTEM.TMSCHEMA_CALCULATED_ITEMS"
    )
    if not raw_calc_tables:
        raw_calc_tables = _dmv_query(
            token, group_id, dataset_id,
            "SELECT [TableName], [Expression] FROM $SYSTEM.TMSCHEMA_CALCULATED_TABLE_COLUMNS"
        )
    calc_tables = [
        {"name": r.get("[Name]") or r.get("TableName") or r.get("Name", ""),
         "expression": r.get("[Expression]") or r.get("Expression", "")}
        for r in (raw_calc_tables or [])
    ]

    # Complexity score (0–100)
    score = min(100, len(measures) + len(calc_columns) * 2 + len(calc_tables) * 3)

    return {
        "tables": tables,
        "measures": measures,
        "calculated_columns": calc_columns,
        "calculated_tables": calc_tables,
        "complexity_score": score,
        "table_count": len([t for t in tables if not t["is_hidden"]]),
        "measure_count": len(measures),
        "calculated_column_count": len(calc_columns),
        "calculated_table_count": len(calc_tables),
        "dmv_supported": True,
    }


# ── Workspace listing (lightweight, for selection UI) ─────────────────────────

def list_workspaces(auth_id: str) -> list[dict]:
    """
    Return a lightweight list of workspaces the user has access to.
    Used by the frontend to let the user pick which workspaces to assess.
    """
    token = _get_token(auth_id)
    raw = _pbi_get(token, "/groups?$filter=type eq 'Workspace'")
    if not isinstance(raw, list):
        raw = []

    workspaces = []
    for ws in raw:
        ws_id = ws.get("id", "")
        # Quick dataset count (no details)
        raw_datasets = _pbi_get(token, f"/groups/{ws_id}/datasets")
        ds_count = len(raw_datasets) if isinstance(raw_datasets, list) else 0
        raw_reports = _pbi_get(token, f"/groups/{ws_id}/reports")
        rpt_count = len(raw_reports) if isinstance(raw_reports, list) else 0

        workspaces.append({
            "id": ws_id,
            "name": ws.get("name", ""),
            "type": ws.get("type", "Workspace"),
            "state": ws.get("state", "Active"),
            "capacity_id": ws.get("capacityId", ""),
            "dataset_count": ds_count,
            "report_count": rpt_count,
        })

    return workspaces


# ── Main assessment runner ────────────────────────────────────────────────────

def run_fabric_assessment(
    fabric_session_id: str,
    auth_id: str,
    workspace_ids: Optional[list[str]] = None,
    on_progress: Optional[Any] = None,
) -> dict:
    """
    Full Fabric workspace assessment.
    Collects workspaces → datasets (semantic models) → reports → paginated reports.

    workspace_ids : if provided, only assess those workspace IDs.
                    If None or empty, assess ALL accessible workspaces.
    Returns structured results dict.
    """
    def _progress(msg: str):
        logger.info("[fabric:%s] %s", fabric_session_id, msg)
        if on_progress:
            on_progress(msg)

    token = _get_token(auth_id)

    # ── 1. Workspaces ─────────────────────────────────────────────────────────
    _progress("Fetching workspaces…")
    raw_workspaces = _pbi_get(token, "/groups?$filter=type eq 'Workspace'")
    if not isinstance(raw_workspaces, list):
        raw_workspaces = []

    # Filter to selected workspaces if provided
    if workspace_ids:
        selected = set(workspace_ids)
        raw_workspaces = [ws for ws in raw_workspaces if ws.get("id") in selected]
        _progress(f"Assessing {len(raw_workspaces)} selected workspace(s)…")
    else:
        _progress(f"Assessing all {len(raw_workspaces)} workspace(s)…")

    workspaces: list[dict] = []
    total_measures = 0
    total_calc_tables = 0
    total_calc_columns = 0
    total_reports = 0
    total_paginated = 0
    total_datasets = 0

    for ws in raw_workspaces:
        ws_id   = ws.get("id", "")
        ws_name = ws.get("name", "")
        _progress(f"Assessing workspace: {ws_name}")

        # ── 2. Semantic Models (datasets) ────────────────────────────────────
        _progress(f"  Fetching semantic models in '{ws_name}'…")
        raw_datasets = _pbi_get(token, f"/groups/{ws_id}/datasets")
        if not isinstance(raw_datasets, list):
            raw_datasets = []

        datasets: list[dict] = []
        for ds in raw_datasets:
            ds_id   = ds.get("id", "")
            ds_name = ds.get("name", "")
            if ds_name in _SKIP_MODEL_NAMES:
                continue  # skip internal Microsoft usage-metric models
            _progress(f"    Analysing model: {ds_name}")
            try:
                details = _get_dataset_details(token, ws_id, ds_id)
            except Exception as exc:
                logger.warning("Could not get details for dataset %s: %s", ds_id, exc)
                details = _empty_details()

            total_measures      += details["measure_count"]
            total_calc_tables   += details["calculated_table_count"]
            total_calc_columns  += details["calculated_column_count"]
            total_datasets      += 1

            # Determine overall storage mode from tables
            storage_modes = {t["storage_mode"] for t in details["tables"]}
            if len(storage_modes) > 1:
                overall_mode = "Composite"
            elif storage_modes:
                overall_mode = next(iter(storage_modes))
            else:
                overall_mode = ds.get("storageMode") or ds.get("StorageMode") or "Import"

            datasets.append({
                "id": ds_id,
                "name": ds_name,
                "configured_by": ds.get("configuredBy", ""),
                "is_refreshable": ds.get("isRefreshable", False),
                "is_on_prem_gateway_required": ds.get("isOnPremGatewayRequired", False),
                "web_url": ds.get("webUrl", ""),
                "storage_mode": overall_mode,
                **details,
            })

        # ── 3. Reports ───────────────────────────────────────────────────────
        _progress(f"  Fetching reports in '{ws_name}'…")
        raw_reports = _pbi_get(token, f"/groups/{ws_id}/reports")
        if not isinstance(raw_reports, list):
            raw_reports = []

        reports: list[dict] = []
        for rpt in raw_reports:
            is_paginated = rpt.get("reportType", "") == "PaginatedReport"
            if is_paginated:
                total_paginated += 1
            else:
                total_reports += 1

            page_count = None
            if not is_paginated:
                try:
                    pages = _pbi_get(token, f"/groups/{ws_id}/reports/{rpt['id']}/pages")
                    page_count = len(pages) if isinstance(pages, list) else None
                except Exception:
                    pass

            reports.append({
                "id": rpt.get("id", ""),
                "name": rpt.get("name", ""),
                "report_type": rpt.get("reportType", "PowerBIReport"),
                "is_paginated": is_paginated,
                "dataset_id": rpt.get("datasetId", ""),
                "web_url": rpt.get("webUrl", ""),
                "page_count": page_count,
            })

        workspaces.append({
            "id": ws_id,
            "name": ws_name,
            "type": ws.get("type", "Workspace"),
            "state": ws.get("state", "Active"),
            "is_read_only": ws.get("isReadOnly", False),
            "capacity_id": ws.get("capacityId", ""),
            "datasets": datasets,
            "reports": reports,
            "dataset_count": len(datasets),
            "report_count": len([r for r in reports if not r["is_paginated"]]),
            "paginated_report_count": len([r for r in reports if r["is_paginated"]]),
        })

    # ── Summary ───────────────────────────────────────────────────────────────
    results = {
        "assessed_at": datetime.now(timezone.utc).isoformat(),
        "workspaces": workspaces,
        "summary": {
            "workspace_count": len(workspaces),
            "dataset_count": total_datasets,
            "report_count": total_reports,
            "paginated_report_count": total_paginated,
            "total_measures": total_measures,
            "total_calculated_tables": total_calc_tables,
            "total_calculated_columns": total_calc_columns,
        },
    }
    _progress("Assessment complete.")
    return results
