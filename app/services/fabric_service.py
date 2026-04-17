"""
Microsoft Fabric / Power BI Workspace Assessment Service.

Auth  : DeviceCodeCredential (azure-identity) — user visits aka.ms/devicelogin
        Works in cloud (Azure App Service) and local environments.
        Token cached inside the credential; re-acquired automatically on expiry.

API   : Power BI REST API  (api.powerbi.com/v1.0/myorg/)
DAX   : executeQueries endpoint → INFO.* DAX functions
        Yields: tables, measures, calculated tables, calculated columns, storage modes.
        INFO.* works for ALL model types: Import, DirectQuery, DirectLake, Composite.
        Note: Fabric Lakehouses / Warehouses do NOT support executeQueries (400).
              On first 400 for a dataset, all remaining queries are skipped.
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

# INFO.* StorageMode values (different from TMSCHEMA):
# 1=Import/InMemory, 2=DirectQuery, 3=Dual/Composite, 4=DirectLake
_INFO_STORAGE_MODE = {
    0: "Import",
    1: "Import",
    2: "DirectQuery",
    3: "Composite",
    4: "DirectLake",
}

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


def _execute_dax(token: str, group_id: str, dataset_id: str, query: str) -> Optional[list[dict]]:
    """
    Execute a DAX query (INFO.* or DMV) against a dataset via executeQueries.

    Returns:
      list[dict]  — rows from the first result table
      []          — query succeeded but returned no rows, OR a 403 (no permission)
      None        — dataset does NOT support executeQueries (HTTP 400).
                    Caller should skip all further queries for this dataset.
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
            logger.debug("executeQueries not supported (400) for dataset %s — skipping", dataset_id)
            return None   # sentinel: caller must short-circuit
        elif resp.status_code == 403:
            logger.debug("executeQueries blocked (no permission) for dataset %s", dataset_id)
            return []
        else:
            logger.warning("DAX query failed (%s) for dataset %s", resp.status_code, dataset_id)
    except Exception as exc:
        logger.warning("DAX query exception for dataset %s: %s", dataset_id, exc)
    return []


def _row_val(row: dict, *names, default=None):
    """
    Extract a value from an executeQueries row, trying multiple key formats:
      [ColumnName], ColumnName, TABLE[ColumnName]
    """
    for name in names:
        bracketed = f"[{name}]"
        if bracketed in row:
            return row[bracketed]
        if name in row:
            return row[name]
        # Try "TABLENAME[ColumnName]" suffixes
        for key, val in row.items():
            if key.endswith(bracketed):
                return val
    return default


def _val_int(val, default: int = 0) -> int:
    try:
        if val is None:
            return default
        return int(val)
    except (ValueError, TypeError):
        return default


def _val_bool(val, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("true", "1", "yes")
    return bool(val)


# ── Dataset complexity via DAX INFO.* ────────────────────────────────────────

def _empty_details() -> dict:
    return {
        "tables": [], "measures": [], "calculated_columns": [], "calculated_tables": [],
        "relationship_count": 0,
        "complexity_score": 0, "table_count": 0, "measure_count": 0,
        "calculated_column_count": 0, "calculated_table_count": 0,
        "info_supported": False,
    }


def _get_dataset_details(token: str, group_id: str, dataset_id: str) -> dict:
    """
    Collect tables, measures, calculated tables, calculated columns, and relationships
    for a semantic model using DAX INFO.* functions via executeQueries.

    INFO.* works for ALL Power BI / Fabric model types:
      Import, DirectQuery, Composite, DirectLake.

    If the dataset does not support executeQueries (Lakehouse, Warehouse, Push dataset)
    the first query returns None and we return immediately — no further queries fired.
    """
    # ── Tables — first probe; bail immediately on 400 ────────────────────────
    raw_tables = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.TABLES()")
    if raw_tables is None:
        return _empty_details()

    # Build table ID → info map
    table_map: dict[int, dict] = {}
    for r in raw_tables:
        tid  = _val_int(_row_val(r, "ID"))
        name = _row_val(r, "Name", default="")
        mode = _val_int(_row_val(r, "StorageMode"), default=1)
        hidden = _val_bool(_row_val(r, "IsHidden"))
        table_map[tid] = {
            "name": name,
            "storage_mode": _INFO_STORAGE_MODE.get(mode, "Import"),
            "is_hidden": hidden,
        }

    # ── Measures ─────────────────────────────────────────────────────────────
    raw_measures = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.MEASURES()")
    measures = []
    for r in (raw_measures or []):
        measures.append({
            "name": _row_val(r, "Name", default=""),
            "expression": _row_val(r, "Expression", default=""),
            "display_folder": _row_val(r, "DisplayFolder", default=""),
            "table_id": _val_int(_row_val(r, "TableID")),
        })

    # ── Calculated columns (Type == 2 = Calculated) ──────────────────────────
    raw_cols = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.COLUMNS()")
    calc_columns = []
    for r in (raw_cols or []):
        col_type = _val_int(_row_val(r, "Type"), default=0)
        if col_type != 2:
            continue
        calc_columns.append({
            "name": _row_val(r, "ExplicitName") or _row_val(r, "Name", default=""),
            "expression": _row_val(r, "Expression", default=""),
            "table_id": _val_int(_row_val(r, "TableID")),
        })

    # ── Calculated tables (partitions with an Expression) ────────────────────
    raw_parts = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.PARTITIONS()")
    calc_table_ids: set[int] = set()
    calc_table_exprs: dict[int, str] = {}
    for r in (raw_parts or []):
        expr = _row_val(r, "Expression", default="")
        if expr and str(expr).strip():
            tid = _val_int(_row_val(r, "TableID"))
            calc_table_ids.add(tid)
            calc_table_exprs[tid] = str(expr).strip()

    calc_tables = []
    for tid in calc_table_ids:
        info = table_map.get(tid, {})
        calc_tables.append({
            "name": info.get("name", f"Table_{tid}"),
            "expression": calc_table_exprs.get(tid, ""),
        })

    # ── Relationships ─────────────────────────────────────────────────────────
    raw_rels = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.RELATIONSHIPS()")
    relationship_count = len(raw_rels) if raw_rels else 0

    # ── Build visible table list (exclude hidden system tables) ───────────────
    calc_table_names = {c["name"] for c in calc_tables}
    tables_out = []
    for info in table_map.values():
        tables_out.append({
            "name": info["name"],
            "storage_mode": info["storage_mode"],
            "is_hidden": info["is_hidden"],
            "is_calculated": info["name"] in calc_table_names,
        })

    visible_tables = [t for t in tables_out if not t["is_hidden"]]

    # ── Complexity score ──────────────────────────────────────────────────────
    score = min(100,
        len(measures)
        + len(calc_columns) * 2
        + len(calc_tables) * 3
        + relationship_count
    )

    return {
        "tables": tables_out,
        "measures": [{"name": m["name"], "expression": m["expression"], "display_folder": m["display_folder"]} for m in measures],
        "calculated_columns": [{"name": c["name"], "expression": c["expression"]} for c in calc_columns],
        "calculated_tables": calc_tables,
        "relationship_count": relationship_count,
        "complexity_score": score,
        "table_count": len(visible_tables),
        "measure_count": len(measures),
        "calculated_column_count": len(calc_columns),
        "calculated_table_count": len(calc_tables),
        "info_supported": True,
    }


# ── Report detail collection ─────────────────────────────────────────────────

def _get_report_details(token: str, group_id: str, report_id: str) -> dict:
    """
    Collect page count, total visual count, and bookmark count for a report.

    Visual count: sum of visuals across all pages (requires page iteration).
    Bookmarks: GET /groups/{ws}/reports/{rpt}/bookmarks.
    Returns dict with visual_count, page_count, bookmark_count.
    """
    visual_count   = 0
    bookmark_count = 0
    page_count     = 0

    try:
        pages = _pbi_get(token, f"/groups/{group_id}/reports/{report_id}/pages")
        if isinstance(pages, list):
            page_count = len(pages)
            for page in pages:
                # page["name"] is the internal name used in the API path (e.g. "ReportSection1")
                page_name = page.get("name", "")
                if not page_name:
                    continue
                try:
                    visuals = _pbi_get(
                        token,
                        f"/groups/{group_id}/reports/{report_id}/pages/{page_name}/visuals",
                    )
                    if isinstance(visuals, list):
                        visual_count += len(visuals)
                except Exception as ve:
                    logger.debug(
                        "Could not fetch visuals for page %s/%s: %s",
                        report_id, page_name, ve,
                    )
    except Exception as exc:
        logger.debug("Could not fetch pages for report %s: %s", report_id, exc)

    try:
        bookmarks = _pbi_get(token, f"/groups/{group_id}/reports/{report_id}/bookmarks")
        if isinstance(bookmarks, list):
            bookmark_count = len(bookmarks)
    except Exception as exc:
        logger.debug("Could not fetch bookmarks for report %s: %s", report_id, exc)

    return {
        "page_count": page_count,
        "visual_count": visual_count,
        "bookmark_count": bookmark_count,
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
    total_relationships = 0
    total_visuals = 0
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

            total_measures       += details["measure_count"]
            total_calc_tables    += details["calculated_table_count"]
            total_calc_columns   += details["calculated_column_count"]
            total_relationships  += details.get("relationship_count", 0)
            total_datasets       += 1

            # Determine overall storage mode from visible table storage modes
            visible_modes = {
                t["storage_mode"]
                for t in details["tables"]
                if not t.get("is_hidden")
            }
            # Remove "Import" if other modes also present (Composite scenario)
            if len(visible_modes) > 1:
                overall_mode = "Composite"
            elif visible_modes:
                overall_mode = next(iter(visible_modes))
            else:
                # Fallback: use REST API storageMode field or "Import"
                api_mode = (ds.get("storageMode") or ds.get("StorageMode") or "").strip()
                overall_mode = api_mode if api_mode else "Import"

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
            rpt_id       = rpt.get("id", "")
            is_paginated = rpt.get("reportType", "") == "PaginatedReport"
            if is_paginated:
                total_paginated += 1
            else:
                total_reports += 1

            rpt_details: dict = {"page_count": None, "visual_count": 0, "bookmark_count": 0}
            if not is_paginated and rpt_id:
                _progress(f"    Collecting report details: {rpt.get('name', rpt_id)}")
                try:
                    rpt_details = _get_report_details(token, ws_id, rpt_id)
                    total_visuals += rpt_details.get("visual_count", 0)
                except Exception as exc:
                    logger.debug("Could not get report details for %s: %s", rpt_id, exc)

            reports.append({
                "id": rpt_id,
                "name": rpt.get("name", ""),
                "report_type": rpt.get("reportType", "PowerBIReport"),
                "is_paginated": is_paginated,
                "dataset_id": rpt.get("datasetId", ""),
                "web_url": rpt.get("webUrl", ""),
                "page_count": rpt_details.get("page_count"),
                "visual_count": rpt_details.get("visual_count", 0),
                "bookmark_count": rpt_details.get("bookmark_count", 0),
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
            "total_relationships": total_relationships,
            "total_visuals": total_visuals,
        },
    }
    _progress("Assessment complete.")
    return results
