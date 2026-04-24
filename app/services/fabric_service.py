"""
Microsoft Fabric / Power BI Workspace Assessment Service.

Auth  : DeviceCodeCredential (azure-identity) — user visits aka.ms/devicelogin
        Token cached inside the credential; re-acquired automatically on expiry.

API   : Power BI REST API  (api.powerbi.com/v1.0/myorg/)
DAX   : executeQueries endpoint → INFO.* DAX functions
        Yields: tables, measures, calc tables, calculated columns, storage modes.
        INFO.* works for ALL model types: Import, DirectQuery, DirectLake, Composite.
        Note: Fabric Lakehouses / Warehouses do NOT support executeQueries (400).
              On first 400 for a dataset, all remaining queries are skipped.
        Fallback: Metadata Scanning API (/admin/workspaces/getInfo) is used when
              executeQueries returns 400 (e.g. Pro/shared capacity workspaces).
              Requires Fabric Admin or Power BI Service Admin role on the caller.

Visual Analysis:
        Downloads PBIX via Export endpoint → parses Report/Layout JSON (UTF-16-LE).
        Extracts visual types + prototypeQuery field bindings per page.
        Resolves measures → DAX dependency columns+tables via expression parsing.
        Fallback: Pages REST API for page/visual counts when PBIX unavailable.

Measure Complexity:
        Scores each measure expression by DAX function tier, nesting depth,
        and column reference count. Returns level: Simple/Moderate/Complex/Very Complex.
"""

import concurrent.futures
import io
import json
import re
import time
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from azure.identity import DeviceCodeCredential

from app.config import settings
from app.core.logging import get_logger

# ── Optional: semantic-link-labs (Microsoft Fabric analysis library) ──────────
# Used for helper utilities and REST API access where available.
# Gracefully degrades if not installed or if running outside a Fabric environment.
try:
    import sempy_labs as labs  # type: ignore
    _SEMPY_LABS_AVAILABLE = True
except ImportError:
    _SEMPY_LABS_AVAILABLE = False

try:
    import pandas as _pd  # type: ignore
    _PANDAS_AVAILABLE = True
except ImportError:
    _PANDAS_AVAILABLE = False

logger = get_logger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

PBI_BASE     = "https://api.powerbi.com/v1.0/myorg"
PBI_SCOPE    = "https://analysis.windows.net/powerbi/api/.default"
FABRIC_BASE  = "https://api.fabric.microsoft.com/v1"
FABRIC_SCOPE = "https://api.fabric.microsoft.com/.default"

_INFO_STORAGE_MODE = {
    0: "Import",
    1: "Import",
    2: "DirectQuery",
    3: "Composite",
    4: "DirectLake",
}

_SKIP_MODEL_NAMES = frozenset({
    "Report Usage Metrics Model",
    "Dashboard Usage Metrics Model",
    "Usage Metrics Report",
})

# Name fragments that identify Fabric-internal staging / lakehouse models which
# do not expose any metadata API (getDefinition, Scanner, DAX executeQueries all fail).
# Matched case-insensitively as substrings against the dataset name.
_SKIP_MODEL_NAME_FRAGMENTS = (
    "DataflowsStagingWarehouse",
    "DataflowsStaging",
    "StagingWarehouse",
)

# Non-data visual types to skip during field extraction
_SKIP_VISUAL_TYPES = frozenset({
    "image", "textbox", "shape", "actionButton", "basicShape",
    "page", "group", "card",
})

# Max PBIX size to download for layout parsing (50 MB)
_MAX_PBIX_BYTES = 50 * 1024 * 1024

# ── DAX complexity scoring ────────────────────────────────────────────────────

_DAX_FUNC_SCORES: dict[str, int] = {
    # Simple aggregations — score 1
    **{f: 1 for f in [
        "SUM", "COUNT", "AVERAGE", "MIN", "MAX", "DISTINCTCOUNT", "COUNTROWS",
        "COUNTA", "COUNTBLANK", "MEDIAN", "STDEV.S", "STDEV.P", "VAR.S", "VAR.P",
        "PRODUCT", "ABS", "INT", "ROUND", "ROUNDUP", "ROUNDDOWN", "CEILING",
        "FLOOR", "SQRT", "POWER", "LOG", "EXP", "MOD", "QUOTIENT",
        "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "NOW", "TODAY",
        "DATE", "WEEKDAY", "WEEKNUM", "EOMONTH",
        "LEN", "LEFT", "RIGHT", "MID", "TRIM", "UPPER", "LOWER",
        "SUBSTITUTE", "CONCATENATE", "FORMAT", "TEXT", "VALUE", "BLANK",
        "TRUE", "FALSE", "NOT", "AND", "OR", "IFERROR", "ISBLANK", "ISERROR",
    ]},
    # Moderate — score 2
    **{f: 2 for f in [
        "IF", "SWITCH", "DIVIDE", "ISNUMBER", "ISTEXT", "ISLOGICAL",
        "ISFILTERED", "ISCROSSFILTERED", "HASONEVALUE", "HASONEFILTER",
        "SELECTEDVALUE", "LOOKUPVALUE", "CONTAINS", "CONTAINSROW",
        "DATEDIFF", "DATEADD", "FIND", "SEARCH", "CONCATENATEX",
        "CONVERT", "COALESCE", "UNICHAR", "UNICODE",
    ]},
    # Complex — score 3
    **{f: 3 for f in [
        "CALCULATE", "FILTER", "ALL", "ALLEXCEPT", "ALLSELECTED",
        "ALLNOBLANKROW", "VALUES", "DISTINCT", "RELATED", "RELATEDTABLE",
        "USERELATIONSHIP", "CROSSFILTER", "REMOVEFILTERS", "KEEPFILTERS",
        "TREATAS", "SELECTEDVALUE", "ROLLUP", "ROLLUPADDISSUBTOTAL",
        "FIRST", "LAST", "FIRSTNONBLANK", "LASTNONBLANK",
        "FIRSTNONBLANKVALUE", "LASTNONBLANKVALUE",
        "TOTALYTD", "TOTALQTD", "TOTALMTD", "SAMEPERIODLASTYEAR",
        "PREVIOUSMONTH", "PREVIOUSQUARTER", "PREVIOUSYEAR", "PREVIOUSDAY",
        "NEXTMONTH", "NEXTQUARTER", "NEXTYEAR", "NEXTDAY",
        "DATESINPERIOD", "DATESBETWEEN", "DATESYTD", "DATESQTD", "DATESMTD",
        "PARALLELPERIOD", "STARTOFMONTH", "STARTOFQUARTER", "STARTOFYEAR",
        "ENDOFMONTH", "ENDOFQUARTER", "ENDOFYEAR", "FIRSTDATE", "LASTDATE",
        "CALENDARAUTO", "CALENDAR",
    ]},
    # Iterator functions — score 4
    **{f: 4 for f in [
        "SUMX", "COUNTX", "AVERAGEX", "MAXX", "MINX", "MEDIANX",
        "STDEVX.S", "STDEVX.P", "VARX.S", "VARX.P", "PRODUCTX",
        "PERCENTILEX.INC", "PERCENTILEX.EXC", "RANKX",
    ]},
    # Very complex — score 5
    **{f: 5 for f in [
        "EARLIER", "EARLIEST", "TOPN", "PATH", "PATHITEM", "PATHLENGTH",
        "PATHCONTAINS", "GENERATE", "GENERATEALL",
        "NATURALLEFTOUTERJOIN", "NATURALINNERJOIN",
        "INTERSECT", "EXCEPT", "UNION", "CROSSJOIN",
        "ROW", "DATATABLE", "SELECTCOLUMNS", "ADDCOLUMNS",
        "SUMMARIZE", "SUMMARIZECOLUMNS", "GROUPBY",
        "ISONORAFTER", "OFFSET", "WINDOW", "RANK", "ROWNUMBER", "INDEX",
        "MATCHBY", "ORDERBY", "PARTITIONBY", "DETAILROWS",
    ]},
}

# Match: 'Table Name'[Column] or TableName[Column]
_TABLE_COL_RE = re.compile(
    r"(?:'([^']+)'|([A-Za-z_\u00C0-\u024F][A-Za-z0-9_\u00C0-\u024F ]*))\[([^\[\]]+)\]"
)
_DAX_FUNC_RE = re.compile(r"\b([A-Z][A-Z0-9_.]*)\s*\(", re.IGNORECASE)

# ── Complexity / dependency helpers ──────────────────────────────────────────

def _score_measure_complexity(expression: str) -> dict:
    """
    Analyse a DAX expression and return a complexity dict:
      score, level, function_count, nesting_depth, dependency_count, complex_functions
    """
    if not expression or not expression.strip():
        return {
            "score": 0, "level": "None",
            "function_count": 0, "nesting_depth": 0,
            "dependency_count": 0, "complex_functions": [],
        }

    funcs_found = [f.upper() for f in _DAX_FUNC_RE.findall(expression)]
    total_score = 0
    complex_used: list[str] = []
    for f in funcs_found:
        s = _DAX_FUNC_SCORES.get(f, 1)
        total_score += s
        if s >= 3:
            complex_used.append(f)

    # Nesting depth (max parenthesis depth)
    depth = max_depth = 0
    for ch in expression:
        if ch == "(":
            depth += 1
            if depth > max_depth:
                max_depth = depth
        elif ch == ")":
            depth -= 1

    nesting_bonus = max(0, max_depth - 2) * 2
    total_score += nesting_bonus

    # Length bonus
    expr_len = len(expression)
    if expr_len > 500:
        total_score += 5
    elif expr_len > 200:
        total_score += 2

    dep_count = len(_TABLE_COL_RE.findall(expression))
    total_score += dep_count

    if total_score == 0:
        level = "None"
    elif total_score <= 5:
        level = "Simple"
    elif total_score <= 18:
        level = "Moderate"
    elif total_score <= 40:
        level = "Complex"
    else:
        level = "Very Complex"

    return {
        "score": total_score,
        "level": level,
        "function_count": len(funcs_found),
        "nesting_depth": max_depth,
        "dependency_count": dep_count,
        "complex_functions": sorted(set(complex_used)),
    }


def _extract_dax_dependencies(expression: str) -> list[dict]:
    """Return unique [{table, column}] references found in a DAX expression."""
    if not expression:
        return []
    seen: set[tuple] = set()
    deps: list[dict] = []
    for m in _TABLE_COL_RE.finditer(expression):
        table  = (m.group(1) or m.group(2) or "").strip()
        column = (m.group(3) or "").strip()
        if table and column:
            key = (table, column)
            if key not in seen:
                seen.add(key)
                deps.append({"table": table, "column": column})
    return deps


# ── In-memory auth registry ───────────────────────────────────────────────────

_auth: dict[str, dict] = {}
_auth_lock = threading.Lock()
_FALLBACK_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"  # Azure CLI

# ── Cancellation flags ────────────────────────────────────────────────────────
# Maps fabric_session_id → threading.Event. Set the event to signal cancellation.
_cancel_flags: dict[str, threading.Event] = {}
_cancel_lock  = threading.Lock()


def request_cancel(fabric_session_id: str) -> None:
    """Signal a running assessment to stop at the next checkpoint."""
    with _cancel_lock:
        flag = _cancel_flags.get(fabric_session_id)
        if flag:
            flag.set()


def _register_cancel_flag(fabric_session_id: str) -> threading.Event:
    flag = threading.Event()
    with _cancel_lock:
        _cancel_flags[fabric_session_id] = flag
    return flag


def _deregister_cancel_flag(fabric_session_id: str) -> None:
    with _cancel_lock:
        _cancel_flags.pop(fabric_session_id, None)


# ── Auth helpers ──────────────────────────────────────────────────────────────

def start_device_auth() -> dict[str, str]:
    auth_id = str(uuid.uuid4())
    entry: dict[str, Any] = {
        "status": "starting", "credential": None, "token": None,
        "user_code": None, "verification_url": None,
        "expires_at": None, "error": None,
    }
    with _auth_lock:
        _auth[auth_id] = entry

    code_ready = threading.Event()

    def _prompt_callback(verification_uri: str, user_code: str, expires_on: datetime):
        with _auth_lock:
            _auth[auth_id].update({
                "status": "pending",
                "user_code": user_code,
                "verification_url": verification_uri,
                "expires_at": expires_on.isoformat() if expires_on else None,
            })
        code_ready.set()

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
                    "status": "ready", "credential": cred, "token": tok.token,
                })
            logger.info("Fabric device auth completed for auth_id=%s", auth_id)
        except Exception as exc:
            logger.error("Fabric device auth failed for auth_id=%s: %s", auth_id, exc)
            with _auth_lock:
                _auth[auth_id].update({"status": "error", "error": str(exc)})
            code_ready.set()

    threading.Thread(target=_acquire_token, daemon=True,
                     name=f"fabric-auth-{auth_id}").start()
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
    with _auth_lock:
        entry = _auth.get(auth_id)
    if not entry or entry["status"] != "ready":
        raise RuntimeError("Fabric auth not ready")
    cred: DeviceCodeCredential = entry["credential"]
    tok = cred.get_token(PBI_SCOPE)
    with _auth_lock:
        _auth[auth_id]["token"] = tok.token
    return tok.token


def _get_fabric_token(auth_id: str) -> str:
    """
    Get a token scoped for the Fabric REST API (api.fabric.microsoft.com).
    Uses the same credential as _get_token() — no extra login needed.
    Falls back to the PBI-scoped token if the Fabric scope fails.
    """
    with _auth_lock:
        entry = _auth.get(auth_id)
    if not entry or entry["status"] != "ready":
        raise RuntimeError("Fabric auth not ready")
    cred: DeviceCodeCredential = entry["credential"]
    try:
        tok = cred.get_token(FABRIC_SCOPE)
        return tok.token
    except Exception as exc:
        logger.debug("Fabric scope token failed (%s), falling back to PBI scope", exc)
        tok = cred.get_token(PBI_SCOPE)
        return tok.token


# ── REST API helpers ──────────────────────────────────────────────────────────

def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _pbi_get(token: str, path: str) -> Any:
    """
    Paginated GET against the Power BI REST API.
    Follows @odata.nextLink until all pages are consumed.
    Returns a flat list of all items (or the raw dict for non-list responses).
    """
    url = f"{PBI_BASE}{path}"
    results: list = []
    while url:
        try:
            resp = requests.get(url, headers=_headers(token), timeout=30)
        except requests.RequestException as exc:
            logger.warning("PBI GET %s → network error: %s", path, exc)
            break
        if resp.status_code == 200:
            data = resp.json()
            page = data.get("value")
            if page is None:
                # Non-list response (e.g. bookmarks wrapper) — return raw
                return data
            results.extend(page)
            url = data.get("@odata.nextLink")  # follow pagination
        elif resp.status_code == 403:
            logger.warning("PBI GET %s → 403 Forbidden (insufficient permissions)", path)
            break
        elif resp.status_code == 404:
            logger.debug("PBI GET %s → 404 Not Found", path)
            break
        else:
            logger.warning("PBI GET %s → HTTP %s", path, resp.status_code)
            break
    return results


def _execute_dax(token: str, group_id: str, dataset_id: str, query: str) -> Optional[list[dict]]:
    """
    Returns list[dict] on success, [] on permission-denied (403),
    None on unsupported (400) — caller must skip all further queries.
    """
    url  = f"{PBI_BASE}/groups/{group_id}/datasets/{dataset_id}/executeQueries"
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
            logger.info(
                "executeQueries not supported (400) for dataset %s — "
                "workspace likely in shared/Pro capacity; will fall back to Scanner API",
                dataset_id,
            )
            return None
        elif resp.status_code == 403:
            logger.warning("executeQueries blocked (403) for dataset %s — insufficient permissions", dataset_id)
            return []
        else:
            logger.warning("DAX query failed (%s) for dataset %s", resp.status_code, dataset_id)
    except Exception as exc:
        logger.warning("DAX query exception for dataset %s: %s", dataset_id, exc)
    return []


def _row_val(row: dict, *names, default=None):
    for name in names:
        bracketed = f"[{name}]"
        if bracketed in row:
            return row[bracketed]
        if name in row:
            return row[name]
        for key, val in row.items():
            if key.endswith(bracketed):
                return val
    return default


def _val_int(val, default: int = 0) -> int:
    try:
        return int(val) if val is not None else default
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


# ── Fabric REST API helpers ───────────────────────────────────────────────────

def _fabric_lro(
    token:   str,
    url:     str,
    body:    Optional[dict] = None,
    timeout: int = 90,
) -> Optional[dict]:
    """
    POST to a Fabric REST API endpoint that uses the long-running operation (LRO)
    pattern (202 + Location header).  Polls until Succeeded, then fetches and
    returns the final result dict.  Returns None on failure or timeout.

    Works with the Power BI-scoped token (PBI_SCOPE) — Fabric REST API accepts it.
    """
    try:
        resp = requests.post(
            url,
            headers=_headers(token),
            json=body if body is not None else {},
            timeout=30,
        )
    except Exception as exc:
        logger.debug("Fabric LRO POST failed for %s: %s", url, exc)
        return None

    if resp.status_code == 200:
        return resp.json()

    if resp.status_code != 202:
        logger.info(
            "Fabric API HTTP %s for %s — needs Contributor access on the item",
            resp.status_code, url,
        )
        return None

    # 202 — async LRO: extract operation URL from Location header or body
    op_url = resp.headers.get("Location", "")
    if not op_url:
        try:
            op_id = resp.json().get("operationId", "")
            if op_id:
                op_url = f"https://api.fabric.microsoft.com/v1/operations/{op_id}"
        except Exception:
            pass

    if not op_url:
        return None

    if not op_url.startswith("http"):
        op_url = f"https://api.fabric.microsoft.com/v1/operations/{op_url}"

    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(2)
        try:
            poll = requests.get(op_url, headers=_headers(token), timeout=15)
            if poll.status_code not in (200, 202):
                logger.debug("Fabric LRO poll HTTP %s", poll.status_code)
                break
            data   = poll.json()
            status = data.get("status", "")
            if status == "Succeeded":
                # Attempt to retrieve result from the dedicated /result sub-resource
                try:
                    r2 = requests.get(f"{op_url}/result", headers=_headers(token), timeout=30)
                    if r2.status_code == 200:
                        return r2.json()
                except Exception:
                    pass
                return data   # fallback: result embedded in final poll response
            if status in ("Failed", "Cancelled"):
                logger.debug("Fabric LRO %s for %s: %s", status, url, data.get("error"))
                return None
        except Exception as exc:
            logger.debug("Fabric LRO poll error: %s", exc)

    logger.warning("Fabric LRO timed out after %ds for %s", timeout, url)
    return None


# ── PBIX layout download & parsing ───────────────────────────────────────────

# Hard wall-clock limit for a single PBIX download (seconds).
# Keeps individual reports from blocking the whole assessment when PBIX export
# is slow or the file is very large.
_PBIX_WALL_TIMEOUT = 45


def _download_pbix_data(token: str, group_id: str, report_id: str) -> Optional[dict]:
    """
    Download the report PBIX file and extract all useful artefacts in memory.
    Nothing is written to disk.

    Returns a dict with:
      layout         – parsed Report/Layout JSON (required; None → whole call returns None)
      connections    – parsed Connections JSON (semantic model link info), or {}
      mashup_queries – list of M-query names found in DataMashup, or []

    A hard wall-clock timeout (_PBIX_WALL_TIMEOUT seconds) is enforced so
    slow exports don't block the whole assessment.
    """

    def _do_download() -> Optional[dict]:
        url = f"{PBI_BASE}/groups/{group_id}/reports/{report_id}/Export"
        try:
            resp = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=(10, 30),
                stream=True,
            )
            if resp.status_code != 200:
                try:
                    err_body = resp.json()
                except Exception:
                    err_body = resp.text[:200]
                logger.warning(
                    "PBIX export HTTP %s for report %s — %s",
                    resp.status_code, report_id, err_body,
                )
                return None

            buf = io.BytesIO()
            for chunk in resp.iter_content(chunk_size=65536):
                buf.write(chunk)
                if buf.tell() > _MAX_PBIX_BYTES:
                    logger.warning(
                        "PBIX >50 MB for report %s — skipping layout parse", report_id
                    )
                    return None
            buf.seek(0)

            result: dict = {"layout": None, "connections": {}, "mashup_queries": []}

            with zipfile.ZipFile(buf, "r") as z:
                names_lower = {n.lower(): n for n in z.namelist()}

                # ── Report/Layout (required) ──────────────────────────────────
                layout_key = names_lower.get("report/layout")
                if not layout_key:
                    return None
                raw  = z.read(layout_key)
                text = raw.decode("utf-16-le", errors="replace")
                result["layout"] = json.loads(text)

                # ── Connections (semantic model link) ─────────────────────────
                conn_key = names_lower.get("connections")
                if conn_key:
                    try:
                        result["connections"] = json.loads(z.read(conn_key))
                    except Exception:
                        pass

                # ── DataMashup (M / Power Query code — nested ZIP) ────────────
                mashup_key = names_lower.get("datamashup")
                if mashup_key:
                    try:
                        mashup_buf = io.BytesIO(z.read(mashup_key))
                        with zipfile.ZipFile(mashup_buf, "r") as mz:
                            mnames = {n.lower(): n for n in mz.namelist()}
                            section_key = mnames.get("formulas/section1.m")
                            if section_key:
                                m_code = mz.read(section_key).decode("utf-8", errors="replace")
                                # Extract query names (shared/section items)
                                result["mashup_queries"] = re.findall(
                                    r"^shared\s+([^\s=]+)", m_code, re.MULTILINE
                                )
                    except Exception:
                        pass

            return result if result["layout"] is not None else None

        except zipfile.BadZipFile:
            logger.debug("PBIX is not a valid ZIP for report %s", report_id)
        except Exception as exc:
            logger.warning("PBIX download/parse error for report %s: %s", report_id, exc)
        return None

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_do_download)
            return future.result(timeout=_PBIX_WALL_TIMEOUT)
    except concurrent.futures.TimeoutError:
        logger.warning(
            "PBIX download timed out after %ds for report %s — skipping",
            _PBIX_WALL_TIMEOUT, report_id,
        )
    except Exception as exc:
        logger.debug("PBIX executor error for report %s: %s", report_id, exc)
    return None


def _resolve_select_item(
    sel: dict,
    from_map: dict[str, str],
    measure_dep_map: dict[str, dict],
) -> Optional[dict]:
    """
    Convert one prototypeQuery.Select entry into a structured field descriptor.

    Handles: Column, Measure, Aggregation, HierarchyLevel.
    Measures are enriched with expression, complexity, and column dependencies.
    """
    AGG_FUNC = {0: "Sum", 1: "Avg", 2: "Min", 3: "Max", 4: "Count",
                5: "DistinctCount", 6: "StdDev", 7: "Variance", 8: "CountNonNull"}

    # ── Direct column reference ───────────────────────────────────────────────
    if "Column" in sel:
        col   = sel["Column"]
        alias = col.get("Expression", {}).get("SourceRef", {}).get("Source", "")
        table = from_map.get(alias, alias)
        col_name = col.get("Property", "")
        if col_name:
            return {"field_type": "column", "name": col_name, "table": table, "dependencies": []}

    # ── Measure reference ─────────────────────────────────────────────────────
    if "Measure" in sel:
        m     = sel["Measure"]
        alias = m.get("Expression", {}).get("SourceRef", {}).get("Source", "")
        table = from_map.get(alias, alias)
        name  = m.get("Property", "")
        if name:
            dep_info = measure_dep_map.get(name, {})
            return {
                "field_type":   "measure",
                "name":         name,
                "table":        dep_info.get("table", table),
                "expression":   dep_info.get("expression", ""),
                "complexity":   dep_info.get("complexity", {}),
                "dependencies": dep_info.get("dependencies", []),
            }

    # ── Aggregation (e.g. Sum of column) ─────────────────────────────────────
    if "Aggregation" in sel:
        agg   = sel["Aggregation"]
        func  = AGG_FUNC.get(agg.get("Function", 0), "Aggregation")
        inner = agg.get("Expression", {})
        if "Column" in inner:
            col   = inner["Column"]
            alias = col.get("Expression", {}).get("SourceRef", {}).get("Source", "")
            table = from_map.get(alias, alias)
            col_name = col.get("Property", "")
            if col_name:
                return {
                    "field_type":   "aggregation",
                    "name":         f"{func}({col_name})",
                    "table":        table,
                    "column":       col_name,
                    "agg_function": func,
                    "dependencies": [{"table": table, "column": col_name}],
                }

    # ── Hierarchy level ───────────────────────────────────────────────────────
    if "HierarchyLevel" in sel:
        hl         = sel["HierarchyLevel"]
        hierarchy  = hl.get("Expression", {}).get("Hierarchy", {})
        alias      = hierarchy.get("Expression", {}).get("SourceRef", {}).get("Source", "")
        table      = from_map.get(alias, alias)
        hier_name  = hierarchy.get("Hierarchy", "")
        level_name = hl.get("Level", "")
        display    = f"{hier_name}.{level_name}" if hier_name else level_name
        return {"field_type": "hierarchy", "name": display, "table": table, "dependencies": []}

    return None


def _parse_layout_pages(
    layout: dict,
    measure_dep_map: dict[str, dict],
) -> list[dict]:
    """
    Parse the Report/Layout JSON into a list of pages, each with visuals and their fields.
    """
    pages_out: list[dict] = []

    for section in layout.get("sections", []):
        page_name  = section.get("displayName") or section.get("name", "Untitled Page")
        page_order = section.get("ordinal", 0)
        visuals_out: list[dict] = []

        for vc in section.get("visualContainers", []):
            try:
                cfg_str = vc.get("config", "{}")
                try:
                    cfg = json.loads(cfg_str)
                except Exception:
                    continue

                sv = cfg.get("singleVisual")
                if not sv:
                    continue

                vtype = sv.get("visualType", "unknown")
                if vtype in _SKIP_VISUAL_TYPES:
                    continue

                # ── Visual title ─────────────────────────────────────────────
                title = ""
                try:
                    title_objs = sv.get("vcObjects", {}).get("title", [])
                    if title_objs:
                        title = (
                            title_objs[0]
                            .get("properties", {})
                            .get("text", {})
                            .get("expr", {})
                            .get("Literal", {})
                            .get("Value", "")
                            .strip("'")
                        )
                except Exception:
                    pass

                # ── prototypeQuery → From + Select ───────────────────────────
                proto    = sv.get("prototypeQuery", {})
                from_map = {
                    f.get("Name", ""): f.get("Entity", "")
                    for f in proto.get("From", [])
                    if f.get("Name") and f.get("Entity")
                }

                fields_out: list[dict] = []
                seen_fields: set[tuple] = set()
                for sel in proto.get("Select", []):
                    fi = _resolve_select_item(sel, from_map, measure_dep_map)
                    if fi:
                        key = (fi["field_type"], fi["name"], fi.get("table", ""))
                        if key not in seen_fields:
                            seen_fields.add(key)
                            fields_out.append(fi)

                visuals_out.append({
                    "type":        vtype,
                    "title":       title,
                    "field_count": len(fields_out),
                    "fields":      fields_out,
                })
            except Exception as exc:
                logger.debug("Visual parse error: %s", exc)
                continue

        pages_out.append({
            "name":         page_name,
            "order":        page_order,
            "visual_count": len(visuals_out),
            "visuals":      visuals_out,
        })

    pages_out.sort(key=lambda p: p["order"])
    return pages_out


# ── Fabric getDefinition — export semantic model as TMDL ─────────────────────

def _get_model_definition(
    token:        str,
    workspace_id: str,
    model_id:     str,
) -> dict[str, str]:
    """
    Export a Fabric semantic model definition via the Fabric REST API.
    Returns {tmdl_path: utf8_content} for every TMDL part, or {} on failure.

    Requires Contributor (or higher) access on the semantic model item.
    Does NOT require Premium capacity or Fabric Admin role.
    Files are processed entirely in memory — nothing is written to disk.

    NOTE: format=TMDL must be a query-string parameter, not a request body field.
    """
    import base64

    # format=TMDL must be a query string parameter per the Fabric REST API spec
    url    = f"{FABRIC_BASE}/workspaces/{workspace_id}/semanticModels/{model_id}/getDefinition?format=TMDL"
    result = _fabric_lro(token, url)
    if not result:
        return {}

    parts = result.get("definition", {}).get("parts", [])
    if not parts:
        parts = result.get("parts", [])   # some API versions embed at top level

    files: dict[str, str] = {}
    for part in parts:
        path    = part.get("path", "")
        payload = part.get("payload", "")
        if path and payload:
            try:
                content = base64.b64decode(payload).decode("utf-8", errors="replace")
                files[path] = content
            except Exception:
                pass

    if files:
        logger.info(
            "Fabric getDefinition: %d TMDL parts for model %s (workspace %s)",
            len(files), model_id, workspace_id,
        )
    return files


# ── Fabric report getDefinition — PBIR format ─────────────────────────────────

def _get_report_definition(
    token:        str,
    workspace_id: str,
    report_id:    str,
) -> dict[str, Any]:
    """
    Export a Fabric-native report definition via the Fabric REST API.
    Handles the PBIR format returned for reports in Fabric-capacity workspaces
    where the classic PBIX /Export endpoint returns no Report/Layout.

    Returns a dict with:
      pages         – list of {name, order, visual_count, visuals}
      page_count    – number of pages
      visual_count  – total visuals across all pages
      layout_parsed – True if parsing succeeded

    Empty/default dict on failure.
    """
    import base64

    url    = f"{FABRIC_BASE}/workspaces/{workspace_id}/reports/{report_id}/getDefinition"
    result = _fabric_lro(token, url)
    if not result:
        return {}

    parts = result.get("definition", {}).get("parts", [])
    if not parts:
        parts = result.get("parts", [])

    # Build a path → parsed-JSON map for all PBIR files
    pbir: dict[str, Any] = {}
    for part in parts:
        path    = part.get("path", "")
        payload = part.get("payload", "")
        if not path or not payload:
            continue
        try:
            raw     = base64.b64decode(payload).decode("utf-8", errors="replace")
            pbir[path] = json.loads(raw)
        except Exception:
            try:
                pbir[path] = raw   # keep as string if not JSON
            except Exception:
                pass

    if not pbir:
        return {}

    logger.info(
        "Fabric report getDefinition: %d PBIR parts for report %s",
        len(pbir), report_id,
    )
    return _parse_pbir_definition(pbir)


def _parse_pbir_definition(pbir: dict[str, Any]) -> dict:
    """
    Parse PBIR file parts into the same page/visual structure used by
    _parse_layout_pages() so it integrates cleanly into the rest of the pipeline.

    PBIR structure (Power BI Report / .pbir):
      report.json                        — report-level metadata
      pages/<pageId>/page.json           — page metadata (name, order)
      pages/<pageId>/visuals/<visId>/visual.json  — visual config (type, query)
    """
    pages_out: list[dict] = []

    # Collect page definitions
    page_files: dict[str, dict] = {}   # pageId → page.json content
    visual_files: dict[str, list] = {} # pageId → list of visual.json contents

    for path, content in pbir.items():
        if not isinstance(content, dict):
            continue
        parts = path.replace("\\", "/").split("/")

        # pages/<pageId>/page.json
        if len(parts) == 3 and parts[0] == "pages" and parts[2] == "page.json":
            page_id = parts[1]
            page_files[page_id] = content

        # pages/<pageId>/visuals/<visId>/visual.json
        elif len(parts) == 5 and parts[0] == "pages" and parts[2] == "visuals" and parts[4] == "visual.json":
            page_id = parts[1]
            visual_files.setdefault(page_id, []).append(content)

    for page_id, page_cfg in page_files.items():
        page_name  = page_cfg.get("displayName") or page_cfg.get("name", page_id)
        page_order = page_cfg.get("ordinal") or page_cfg.get("order", 0)
        visuals_out: list[dict] = []

        for vcfg in visual_files.get(page_id, []):
            try:
                sv = vcfg.get("visual", vcfg)  # some versions wrap in "visual" key
                vtype = sv.get("visualType", sv.get("type", "unknown"))
                if vtype in _SKIP_VISUAL_TYPES:
                    continue

                # Title
                title = ""
                try:
                    title = (
                        sv.get("vcObjects", {})
                        .get("title", [{}])[0]
                        .get("properties", {})
                        .get("text", {})
                        .get("expr", {})
                        .get("Literal", {})
                        .get("Value", "")
                        .strip("'")
                    )
                except Exception:
                    pass

                # Fields from prototypeQuery (same structure as PBIX Layout)
                proto    = sv.get("prototypeQuery", {})
                from_map = {
                    f.get("Name", ""): f.get("Entity", "")
                    for f in proto.get("From", [])
                    if f.get("Name") and f.get("Entity")
                }
                fields_out: list[dict] = []
                seen_fields: set[tuple] = set()
                for sel in proto.get("Select", []):
                    fi = _resolve_select_item(sel, from_map, {})
                    if fi:
                        key = (fi["field_type"], fi["name"], fi.get("table", ""))
                        if key not in seen_fields:
                            seen_fields.add(key)
                            fields_out.append(fi)

                visuals_out.append({
                    "type":        vtype,
                    "title":       title,
                    "field_count": len(fields_out),
                    "fields":      fields_out,
                })
            except Exception as exc:
                logger.debug("PBIR visual parse error: %s", exc)

        pages_out.append({
            "name":         page_name,
            "order":        page_order,
            "visual_count": len(visuals_out),
            "visuals":      visuals_out,
        })

    pages_out.sort(key=lambda p: p["order"])
    return {
        "pages":         pages_out,
        "page_count":    len(pages_out),
        "visual_count":  sum(p["visual_count"] for p in pages_out),
        "layout_parsed": bool(pages_out),
    }


def _parse_tmdl_measures_and_cols(
    content:  str,
    tbl_name: str,
) -> tuple[list[dict], list[dict], dict[str, dict], list[dict]]:
    """
    Line-by-line TMDL parser for a single table file.

    TMDL indentation conventions (spaces):
      0  → table declaration
      4  → column / measure / partition declarations
      8  → property lines  (displayFolder:, formatString:, lineageTag:, …)
      12 → expression continuation lines for multi-line measures

    Returns (measures, calculated_columns, measure_dep_map, all_columns).
    """
    measures:     list[dict] = []
    calc_columns: list[dict] = []
    dep_map:      dict[str, dict] = {}
    all_columns:  list[dict] = []

    _PROP_PREFIXES = (
        "displayfolder:", "formatstring:", "lineagetag:", "annotation ",
        "ishidden", "description:", "kpistatusdefinition", "kpitargetexpression",
        "changedproperty", "summarizeby:", "datacategory:", "isavailableinmdx:",
        "variations", "ishiddeninreport", "formatstringdefinition",
    )

    lines = content.splitlines()
    i = 0
    n = len(lines)

    while i < n:
        raw = lines[i]
        s   = raw.strip()
        ind = len(raw) - len(raw.lstrip()) if s else 0

        # ── Measure at indent 4 ──────────────────────────────────────────────
        if ind == 4 and s.startswith("measure "):
            m = re.match(r"measure\s+'?(.+?)'?\s*=\s*(.*)", s)
            if not m:
                i += 1
                continue

            name        = m.group(1).strip()
            inline_expr = m.group(2).strip()
            display_folder = ""
            expr_parts: list[str] = []
            i += 1

            if inline_expr:
                # Single-line expression — properties follow at indent 8
                expr_parts = [inline_expr]
                while i < n:
                    nraw = lines[i]
                    ns   = nraw.strip()
                    ni   = len(nraw) - len(nraw.lstrip()) if ns else 0
                    if not ns:
                        i += 1
                        continue
                    if ni <= 4:
                        break
                    if ni == 8 and ns.lower().startswith("displayfolder:"):
                        display_folder = ns.split(":", 1)[1].strip().strip("'")
                    i += 1
            else:
                # Multi-line expression — lines at indent ≥12 are DAX,
                # lines at indent 8 are properties.
                in_expr = True
                while i < n:
                    nraw = lines[i]
                    ns   = nraw.strip()
                    ni   = len(nraw) - len(nraw.lstrip()) if ns else 0
                    if not ns:
                        i += 1
                        continue
                    if ni <= 4:
                        break
                    if ni >= 12 and in_expr:
                        expr_parts.append(ns)
                    elif ni == 8:
                        in_expr = False   # switched to property region
                        if ns.lower().startswith("displayfolder:"):
                            display_folder = ns.split(":", 1)[1].strip().strip("'")
                    i += 1

            expr       = "\n".join(expr_parts)
            complexity = _score_measure_complexity(expr)
            deps       = _extract_dax_dependencies(expr)
            enriched   = {
                "name":           name,
                "table":          tbl_name,
                "expression":     expr,
                "display_folder": display_folder,
                "complexity":     complexity,
                "dependencies":   deps,
            }
            measures.append(enriched)
            if name:
                dep_map[name] = enriched
            continue

        # ── Column at indent 4 ──────────────────────────────────────────────
        if ind == 4 and s.startswith("column "):
            cm = re.match(r"column\s+'?(.+?)'?\s*$", s)
            if not cm:
                i += 1
                continue

            col_name   = cm.group(1).strip()
            is_calc    = False
            is_hidden  = False
            col_expr   = ""
            data_type  = ""
            i += 1

            while i < n:
                nraw = lines[i]
                ns   = nraw.strip()
                ni   = len(nraw) - len(nraw.lstrip()) if ns else 0
                if not ns:
                    i += 1
                    continue
                if ni <= 4:
                    break
                ns_l = ns.lower()
                if ns_l == "columntype: calculated":
                    is_calc = True
                elif re.match(r"^expression\s*=\s*(.+)", ns, re.IGNORECASE):
                    em = re.match(r"^expression\s*=\s*(.*)", ns, re.IGNORECASE)
                    col_expr = em.group(1).strip() if em else ""
                    is_calc  = True
                elif ns_l.startswith("datatype:"):
                    data_type = ns.split(":", 1)[1].strip()
                elif ns_l == "ishidden":
                    is_hidden = True
                i += 1

            if col_name:
                _empty_cx = {
                    "score": 0, "level": "None",
                    "function_count": 0, "nesting_depth": 0,
                    "dependency_count": 0, "complex_functions": [],
                }
                col_record: dict = {
                    "name":          col_name,
                    "data_type":     data_type,
                    "is_calculated": is_calc,
                    "is_hidden":     is_hidden,
                }
                if is_calc:
                    complexity = _score_measure_complexity(col_expr) if col_expr else _empty_cx
                    col_record["expression"] = col_expr
                    col_record["complexity"] = complexity
                    calc_columns.append({
                        "name":       col_name,
                        "table":      tbl_name,
                        "expression": col_expr,
                        "data_type":  data_type,
                        "complexity": complexity,
                    })
                all_columns.append(col_record)
            continue

        i += 1

    return measures, calc_columns, dep_map, all_columns


def _parse_model_definition(tmdl_files: dict[str, str]) -> dict:
    """
    Parse the TMDL file dict returned by _get_model_definition() into the same
    structure produced by _get_dataset_details() and _get_workspace_scanner_data().

    Extracts: tables, measures (with DAX complexity), calculated columns/tables,
    relationships (with cardinality/direction), RLS roles, and M/Power Query
    expression names.  Everything stays in memory — no disk I/O.
    """
    tables_out:    list[dict] = []
    all_measures:  list[dict] = []
    all_calc_cols: list[dict] = []
    calc_tables:   list[dict] = []
    relationships: list[dict] = []
    rls_roles:     list[str]  = []
    m_expressions: list[dict] = []
    measure_dep_map: dict[str, dict] = {}

    # ── Relationships ─────────────────────────────────────────────────────────
    rel_content = tmdl_files.get("definition/relationships.tmdl", "")
    if rel_content:
        for block in re.split(r"\nrelationship\s+\S+", rel_content)[1:]:
            ft   = re.search(r"fromTable:\s*'?([^'\n]+?)'?\s*$",  block, re.MULTILINE)
            fc   = re.search(r"fromColumn:\s*'?([^'\n]+?)'?\s*$", block, re.MULTILINE)
            tt   = re.search(r"toTable:\s*'?([^'\n]+?)'?\s*$",    block, re.MULTILINE)
            tc   = re.search(r"toColumn:\s*'?([^'\n]+?)'?\s*$",   block, re.MULTILINE)
            xf   = re.search(r"crossFilteringBehavior:\s*(\w+)",   block)
            card = re.search(r"fromCardinality:\s*(\w+)",          block)
            to_c = re.search(r"toCardinality:\s*(\w+)",            block)
            # isActive defaults to true in TMDL; only present when false
            is_active = not bool(re.search(r"isActive:\s*false", block, re.IGNORECASE))
            if ft and tt:
                from_card = card.group(1) if card else "many"
                to_card   = to_c.group(1)  if to_c else "one"
                cardinality = f"{from_card}:{to_card}"
                relationships.append({
                    "from_table":   ft.group(1).strip(),
                    "from_column":  fc.group(1).strip() if fc else "",
                    "to_table":     tt.group(1).strip(),
                    "to_column":    tc.group(1).strip() if tc else "",
                    "cross_filter": xf.group(1) if xf else "oneDirection",
                    "cardinality":  cardinality,
                    "is_active":    is_active,
                })

    # ── M / Power Query expression names ─────────────────────────────────────
    expr_content = tmdl_files.get("definition/expressions.tmdl", "")
    if expr_content:
        for block in re.split(r"\nexpression\s+", expr_content)[1:]:
            nm = re.match(r"'?([^'\n=]+)'?\s*=\s*", block)
            km = re.search(r"\n\s+kind:\s*(\w+)", block)
            if nm:
                m_expressions.append({
                    "name": nm.group(1).strip(),
                    "kind": km.group(1) if km else "m",
                })

    # ── RLS Roles ─────────────────────────────────────────────────────────────
    for path, content in tmdl_files.items():
        if path.startswith("definition/roles/"):
            rm = re.match(r"role\s+'?([^'\n]+?)'?\s*$",
                          content.strip().splitlines()[0].strip() if content.strip() else "")
            if rm:
                rls_roles.append(rm.group(1).strip())

    # ── Table files ───────────────────────────────────────────────────────────
    _STORAGE_MODE_MAP = {
        "import":       "Import",
        "directquery":  "DirectQuery",
        "dual":         "Composite",
        "directlake":   "DirectLake",
    }

    for path, content in tmdl_files.items():
        if not path.startswith("definition/tables/"):
            continue

        # Table name from file header line
        first_line = content.strip().splitlines()[0].strip() if content.strip() else ""
        th = re.match(r"table\s+'?(.+?)'?\s*$", first_line)
        tbl_name = (
            th.group(1).strip()
            if th else
            path.replace("definition/tables/", "").replace(".tmdl", "")
        )

        # Storage mode (at indent 4)
        sm_m = re.search(r"^\s{4}storageMode:\s*(\w+)", content, re.MULTILINE)
        storage_mode = _STORAGE_MODE_MAP.get(
            (sm_m.group(1) if sm_m else "import").lower(), "Import"
        )

        is_hidden = bool(re.search(r"^\s{4}isHidden\b", content, re.MULTILINE))

        # Calculated table: partition with mode=calculated
        is_calc = bool(re.search(r"^\s+mode:\s*calculated\b", content, re.MULTILINE))
        if is_calc:
            # Try to extract the DAX expression from the partition source block
            ce_m = re.search(
                r"mode:\s*calculated.*?\n\s+source\s*\n((?:\s{12,}[^\n]+\n?)+)",
                content, re.DOTALL,
            )
            calc_expr = ""
            if ce_m:
                calc_expr = "\n".join(
                    ln.strip()
                    for ln in ce_m.group(1).splitlines()
                    if ln.strip()
                )
            complexity = _score_measure_complexity(calc_expr) if calc_expr else {
                "score": 0, "level": "None",
                "function_count": 0, "nesting_depth": 0,
                "dependency_count": 0, "complex_functions": [],
            }
            calc_tables.append({"name": tbl_name, "expression": calc_expr, "complexity": complexity})

        # Parse measures, calculated columns, and ALL columns from the table file
        m_list, cc_list, m_dep, tbl_cols = _parse_tmdl_measures_and_cols(content, tbl_name)
        all_measures.extend(m_list)
        all_calc_cols.extend(cc_list)
        measure_dep_map.update(m_dep)

        tables_out.append({
            "name":          tbl_name,
            "storage_mode":  storage_mode,
            "is_hidden":     is_hidden,
            "is_calculated": is_calc,
            "columns":       tbl_cols,
        })

    # ── Aggregate complexity score ────────────────────────────────────────────
    vis_tables  = [t for t in tables_out if not t["is_hidden"]]
    total_score = sum(m["complexity"]["score"] for m in all_measures)
    model_score = min(100,
        total_score
        + len(all_calc_cols) * 2
        + len(calc_tables)   * 3
        + len(relationships)
    )

    # Add complexity to calc tables that don't have it yet (defensive)
    for ct in calc_tables:
        if "complexity" not in ct:
            ct["complexity"] = _score_measure_complexity(ct.get("expression", ""))

    return {
        "tables":                  tables_out,
        "measures":                all_measures,
        "calculated_columns":      all_calc_cols,
        "calculated_tables":       calc_tables,
        "relationship_count":      len(relationships),
        "relationships":           relationships,
        "rls_roles":               rls_roles,
        "m_expressions":           m_expressions,
        "complexity_score":        model_score,
        "table_count":             len(vis_tables),
        "measure_count":           len(all_measures),
        "calculated_column_count": len(all_calc_cols),
        "calculated_table_count":  len(calc_tables),
        "info_supported":          True,
        "_measure_dep_map":        measure_dep_map,
    }


# ── Dataset details via DAX INFO.* ────────────────────────────────────────────

def _empty_details() -> dict:
    return {
        "tables": [], "measures": [], "calculated_columns": [],
        "calculated_tables": [], "relationships": [], "relationship_count": 0,
        "complexity_score": 0, "table_count": 0, "measure_count": 0,
        "calculated_column_count": 0, "calculated_table_count": 0,
        "info_supported": False,
        "_measure_dep_map": {},   # internal, stripped before API response
    }


def _get_dataset_details(token: str, group_id: str, dataset_id: str) -> dict:
    """
    Collect tables, measures (with complexity + column dependencies),
    calculated tables, calculated columns, and relationships
    for a semantic model using DAX INFO.* via executeQueries.

    Also builds and returns _measure_dep_map (keyed by measure name) for
    use in visual field resolution during report analysis.
    """
    # ── Tables — first probe; bail on 400 ────────────────────────────────────
    raw_tables = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.TABLES()")
    if raw_tables is None:
        return _empty_details()

    table_map: dict[int, dict] = {}
    for r in raw_tables:
        tid    = _val_int(_row_val(r, "ID"))
        name   = _row_val(r, "Name", default="")
        mode   = _val_int(_row_val(r, "StorageMode"), default=1)
        hidden = _val_bool(_row_val(r, "IsHidden"))
        table_map[tid] = {
            "name":         name,
            "storage_mode": _INFO_STORAGE_MODE.get(mode, "Import"),
            "is_hidden":    hidden,
        }

    # name → tid reverse index for measure table resolution
    table_name_to_id = {v["name"]: k for k, v in table_map.items()}

    # ── Measures (enriched) ───────────────────────────────────────────────────
    raw_measures = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.MEASURES()")
    measures: list[dict] = []
    measure_dep_map: dict[str, dict] = {}   # name → enriched info

    for r in (raw_measures or []):
        name       = _row_val(r, "Name",          default="")
        expr       = _row_val(r, "Expression",    default="") or ""
        folder     = _row_val(r, "DisplayFolder", default="") or ""
        tid        = _val_int(_row_val(r, "TableID"))
        table_name = table_map.get(tid, {}).get("name", "")

        complexity = _score_measure_complexity(expr)
        deps       = _extract_dax_dependencies(expr)

        enriched = {
            "name":           name,
            "table":          table_name,
            "expression":     expr,
            "display_folder": folder,
            "complexity":     complexity,
            "dependencies":   deps,
        }
        measures.append(enriched)
        if name:
            measure_dep_map[name] = enriched

    # ── All columns (regular + calculated) ───────────────────────────────────
    raw_cols = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.COLUMNS()")
    calc_columns: list[dict] = []
    # tid → list of column dicts (for attaching to table records)
    cols_by_table: dict[int, list[dict]] = {}
    # col_id → col_name — used to resolve relationship FromColumnID / ToColumnID
    col_id_map: dict[int, str] = {}
    for r in (raw_cols or []):
        col_type  = _val_int(_row_val(r, "Type"), default=0)
        col_name  = _row_val(r, "ExplicitName") or _row_val(r, "Name", default="")
        expr      = _row_val(r, "Expression", default="") or ""
        tid       = _val_int(_row_val(r, "TableID"))
        col_id    = _val_int(_row_val(r, "ID"))
        data_type = str(_row_val(r, "DataType", default="") or "")
        is_hidden = _val_bool(_row_val(r, "IsHidden"))
        if col_id and col_name:
            col_id_map[col_id] = col_name
        is_calc   = (col_type == 2)
        _empty_cx = {
            "score": 0, "level": "None",
            "function_count": 0, "nesting_depth": 0,
            "dependency_count": 0, "complex_functions": [],
        }
        col_record: dict = {
            "name":          col_name,
            "data_type":     data_type,
            "is_calculated": is_calc,
            "is_hidden":     is_hidden,
        }
        if is_calc:
            complexity = _score_measure_complexity(expr) if expr else _empty_cx
            col_record["expression"] = expr
            col_record["complexity"] = complexity
            calc_columns.append({
                "name":       col_name,
                "table":      table_map.get(tid, {}).get("name", ""),
                "expression": expr,
                "data_type":  data_type,
                "complexity": complexity,
            })
        cols_by_table.setdefault(tid, []).append(col_record)

    # ── Calculated tables ────────────────────────────────────────────────────
    raw_parts = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.PARTITIONS()")
    calc_table_ids:   set[int]       = set()
    calc_table_exprs: dict[int, str] = {}
    for r in (raw_parts or []):
        expr = _row_val(r, "Expression", default="")
        if expr and str(expr).strip():
            tid = _val_int(_row_val(r, "TableID"))
            calc_table_ids.add(tid)
            calc_table_exprs[tid] = str(expr).strip()

    calc_tables: list[dict] = []
    for tid in calc_table_ids:
        info = table_map.get(tid, {})
        calc_tables.append({
            "name":       info.get("name", f"Table_{tid}"),
            "expression": calc_table_exprs.get(tid, ""),
        })

    # ── Relationships ─────────────────────────────────────────────────────────
    # INFO.RELATIONSHIPS() Multiplicity values:
    #   1 = One-to-One  |  2 = Many-to-One  |  4 = Many-to-Many
    _MULTIPLICITY_MAP = {1: ("one", "one"), 2: ("many", "one"), 4: ("many", "many")}
    _CROSS_FILTER_MAP = {1: "oneDirection", 2: "bothDirections", 3: "automatic"}
    raw_rels = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.RELATIONSHIPS()")
    relationship_count = len(raw_rels) if raw_rels else 0
    relationships_list: list[dict] = []
    for r in (raw_rels or []):
        from_tid    = _val_int(_row_val(r, "FromTableID"))
        to_tid      = _val_int(_row_val(r, "ToTableID"))
        from_col_id = _val_int(_row_val(r, "FromColumnID"), default=0)
        to_col_id   = _val_int(_row_val(r, "ToColumnID"),   default=0)
        # Resolve column IDs → names using the map built from INFO.COLUMNS()
        from_col    = col_id_map.get(from_col_id, "")
        to_col      = col_id_map.get(to_col_id,   "")
        mult        = _val_int(_row_val(r, "Multiplicity"), default=2)
        xf_raw      = _val_int(_row_val(r, "CrossFilteringBehavior"), default=1)
        is_active   = _val_bool(_row_val(r, "IsActive"), default=True)
        from_card, to_card = _MULTIPLICITY_MAP.get(mult, ("many", "one"))
        relationships_list.append({
            "from_table":   table_map.get(from_tid, {}).get("name", ""),
            "from_column":  from_col,
            "to_table":     table_map.get(to_tid,   {}).get("name", ""),
            "to_column":    to_col,
            "cardinality":  f"{from_card}:{to_card}",
            "cross_filter": _CROSS_FILTER_MAP.get(xf_raw, "oneDirection"),
            "is_active":    is_active,
        })

    # ── Build table list ─────────────────────────────────────────────────────
    calc_table_names = {c["name"] for c in calc_tables}
    tables_out: list[dict] = []
    for tid, info in table_map.items():
        tables_out.append({
            "name":          info["name"],
            "storage_mode":  info["storage_mode"],
            "is_hidden":     info["is_hidden"],
            "is_calculated": info["name"] in calc_table_names,
            "columns":       cols_by_table.get(tid, []),
        })

    visible_tables = [t for t in tables_out if not t["is_hidden"]]

    # ── Aggregate model complexity score ─────────────────────────────────────
    total_complexity = sum(m["complexity"]["score"] for m in measures)
    model_score = min(100,
        total_complexity
        + len(calc_columns) * 2
        + len(calc_tables)  * 3
        + relationship_count
    )

    return {
        "tables":                  tables_out,
        "measures":                measures,
        "calculated_columns":      calc_columns,
        "calculated_tables":       calc_tables,
        "relationships":           relationships_list,
        "relationship_count":      relationship_count,
        "complexity_score":        model_score,
        "table_count":             len(visible_tables),
        "measure_count":           len(measures),
        "calculated_column_count": len(calc_columns),
        "calculated_table_count":  len(calc_tables),
        "info_supported":          True,
        "_measure_dep_map":        measure_dep_map,  # internal — stripped before storage
    }


# ── Report visual analysis ────────────────────────────────────────────────────

def _get_report_visual_details(
    token:           str,
    group_id:        str,
    report_id:       str,
    measure_dep_map: dict[str, dict],
    fabric_token:    str = "",
    workspace_id:    str = "",
) -> dict:
    """
    Full report analysis — three-tier strategy, all in-memory:

    1. PBIX export (/reports/{id}/Export) → parse Report/Layout JSON.
       Works for classic Power BI reports stored in PBIX format.

    2. Fabric getDefinition API → parse PBIR format.
       Used for Fabric-native reports (.pbir) where PBIX export has no Layout.
       Requires workspace_id and a Fabric-scoped token.

    3. Pages REST API (counts only) — final fallback when both above fail.

    Returns:
        {page_count, visual_count, bookmark_count, pages, layout_parsed,
         connections, mashup_queries}
    """
    page_count     = 0
    visual_count   = 0
    bookmark_count = 0
    pages: list[dict] = []
    layout_parsed  = False
    connections:    dict  = {}
    mashup_queries: list  = []

    # ── Tier 1: Download PBIX and extract Report/Layout ──────────────────────
    try:
        pbix_data = _download_pbix_data(token, group_id, report_id)
        if pbix_data:
            layout = pbix_data.get("layout")
            if layout:
                pages         = _parse_layout_pages(layout, measure_dep_map)
                page_count    = len(pages)
                visual_count  = sum(p["visual_count"] for p in pages)
                layout_parsed = True
            connections    = pbix_data.get("connections", {})
            mashup_queries = pbix_data.get("mashup_queries", [])
    except Exception as exc:
        logger.debug("PBIX parse failed for report %s: %s", report_id, exc)

    # ── Tier 2: Fabric getDefinition (PBIR format for Fabric-native reports) ──
    if not layout_parsed and fabric_token and workspace_id:
        try:
            pbir_result = _get_report_definition(fabric_token, workspace_id, report_id)
            if pbir_result.get("layout_parsed"):
                pages         = pbir_result["pages"]
                page_count    = pbir_result["page_count"]
                visual_count  = pbir_result["visual_count"]
                layout_parsed = True
                logger.info("PBIR getDefinition succeeded for report %s", report_id)
        except Exception as exc:
            logger.debug("PBIR getDefinition failed for report %s: %s", report_id, exc)

    # ── Tier 3: Pages REST API (counts only, no field detail) ────────────────
    if not layout_parsed:
        try:
            api_pages = _pbi_get(token, f"/groups/{group_id}/reports/{report_id}/pages")
            if isinstance(api_pages, list):
                page_count = len(api_pages)
                for page in api_pages:
                    page_name = page.get("name", "")
                    if not page_name:
                        continue
                    try:
                        visuals = _pbi_get(
                            token,
                            f"/groups/{group_id}/reports/{report_id}"
                            f"/pages/{page_name}/visuals",
                        )
                        if isinstance(visuals, list):
                            visual_count += len(visuals)
                            pages.append({
                                "name":         page.get("displayName", page_name),
                                "order":        page.get("order", 0),
                                "visual_count": len(visuals),
                                "visuals":      [],
                            })
                    except Exception:
                        pass
        except Exception as exc:
            logger.debug("Pages API fallback failed for report %s: %s", report_id, exc)

    # ── Bookmarks ─────────────────────────────────────────────────────────────
    bookmarks: list[dict] = []
    try:
        bm_raw = _pbi_get(token, f"/groups/{group_id}/reports/{report_id}/bookmarks")
        if isinstance(bm_raw, list):
            bookmark_count = len(bm_raw)
            for bm in bm_raw:
                bm_id    = bm.get("id", "")
                bm_name  = bm.get("name", bm_id)
                bm_disp  = bm.get("displayName", bm_name)
                # Try to extract target page from definition state
                target_page = ""
                try:
                    state   = bm.get("definition", {}).get("state", {})
                    section = (
                        state.get("explorationState", {})
                             .get("activeSection", "")
                    )
                    if not section:
                        section = state.get("defaultState", {}).get("activeSection", "")
                    if section:
                        # Match to page by section name
                        for page in pages:
                            if page.get("name", "") == section:
                                target_page = page["name"]
                                break
                        if not target_page:
                            target_page = section
                except Exception:
                    pass
                bookmarks.append({
                    "id":           bm_id,
                    "name":         bm_disp,
                    "target_page":  target_page,
                })
        elif isinstance(bm_raw, dict):
            # Some endpoints return wrapped value
            bm_list = bm_raw.get("value", [])
            bookmark_count = len(bm_list)
            for bm in bm_list:
                bookmarks.append({
                    "id":          bm.get("id", ""),
                    "name":        bm.get("displayName", bm.get("name", "")),
                    "target_page": "",
                })
    except Exception:
        pass

    return {
        "page_count":      page_count,
        "visual_count":    visual_count,
        "bookmark_count":  bookmark_count,
        "bookmarks":       bookmarks,
        "pages":           pages,
        "layout_parsed":   layout_parsed,
        "connections":     connections,
        "mashup_queries":  mashup_queries,
    }


# ── Metadata Scanning API (admin) ────────────────────────────────────────────

def _get_workspace_scanner_data(token: str, workspace_id: str) -> dict[str, dict]:
    """
    Use the Power BI Metadata Scanning API to get full semantic model info
    (tables, columns, measures with DAX, relationships) for ALL datasets in a workspace.

    Works for ANY capacity tier (Pro, Premium, Fabric) — unlike executeQueries which
    requires Premium/PPU.

    Requires: Fabric Admin or Power BI Service Admin role on the caller.

    Returns: dict of dataset_id → details dict (same shape as _get_dataset_details).
             Empty dict if caller lacks admin role or scan fails.
    """
    _progress_url = f"{PBI_BASE}/admin/workspaces/getInfo"
    params = "lineage=false&datasourceDetails=false&datasetSchema=true&datasetExpressions=true"
    url = f"{_progress_url}?{params}"

    # Step 1 — start scan
    try:
        resp = requests.post(
            url,
            headers=_headers(token),
            json={"workspaces": [workspace_id]},
            timeout=30,
        )
        if resp.status_code not in (200, 202):
            logger.info(
                "Scanner API unavailable (HTTP %s) for workspace %s — caller may not be Fabric Admin",
                resp.status_code, workspace_id,
            )
            return {}
        scan_id = resp.json().get("id", "")
        if not scan_id:
            return {}
        logger.info("Scanner API scan started: %s for workspace %s", scan_id, workspace_id)
    except Exception as exc:
        logger.debug("Scanner API start failed: %s", exc)
        return {}

    # Step 2 — poll until Succeeded (max 60 s)
    status_url = f"{PBI_BASE}/admin/workspaces/scanStatus/{scan_id}"
    for attempt in range(60):
        time.sleep(1)
        try:
            s = requests.get(status_url, headers=_headers(token), timeout=10)
            if s.status_code == 200:
                scan_status = s.json().get("status", "")
                if scan_status == "Succeeded":
                    break
                if scan_status == "Failed":
                    logger.warning("Scanner scan %s failed for workspace %s", scan_id, workspace_id)
                    return {}
        except Exception:
            pass
    else:
        logger.warning("Scanner scan %s timed out after 60 s", scan_id)
        return {}

    # Step 3 — fetch results
    try:
        r = requests.get(
            f"{PBI_BASE}/admin/workspaces/scanResult/{scan_id}",
            headers=_headers(token), timeout=30,
        )
        if r.status_code != 200:
            logger.warning("Scanner result fetch HTTP %s for scan %s", r.status_code, scan_id)
            return {}
        ws_list = r.json().get("workspaces", [])
    except Exception as exc:
        logger.warning("Scanner result parse failed: %s", exc)
        return {}

    if not ws_list:
        return {}

    ws_data    = ws_list[0]
    result_map: dict[str, dict] = {}

    for ds in ws_data.get("datasets", []):
        ds_id   = ds.get("id", "")
        if not ds_id:
            continue

        tables_out:   list[dict] = []
        measures:     list[dict] = []
        calc_cols:    list[dict] = []
        calc_tables:  list[dict] = []
        measure_dep_map: dict[str, dict] = {}

        for tbl in ds.get("tables", []):
            tbl_name  = tbl.get("name", "")
            is_hidden = tbl.get("isHidden", False)

            # Calculated table: has a DAX expression at table level
            tbl_expr = tbl.get("expression", "") or ""
            if tbl_expr.strip():
                tbl_complexity = _score_measure_complexity(tbl_expr) if tbl_expr else {
                    "score": 0, "level": "None",
                    "function_count": 0, "nesting_depth": 0,
                    "dependency_count": 0, "complex_functions": [],
                }
                calc_tables.append({"name": tbl_name, "expression": tbl_expr, "complexity": tbl_complexity})

            # Columns — collect ALL columns, separate out calculated ones
            tbl_cols: list[dict] = []
            for col in tbl.get("columns", []):
                col_name  = col.get("name", "")
                is_calc   = (col.get("columnType") or "") == "CalculatedColumn"
                col_expr  = col.get("expression", "") or ""
                is_hidden_col = col.get("isHidden", False)
                _empty_cx = {
                    "score": 0, "level": "None",
                    "function_count": 0, "nesting_depth": 0,
                    "dependency_count": 0, "complex_functions": [],
                }
                col_record: dict = {
                    "name":          col_name,
                    "data_type":     col.get("dataType", ""),
                    "is_calculated": is_calc,
                    "is_hidden":     is_hidden_col,
                }
                if is_calc:
                    complexity = _score_measure_complexity(col_expr) if col_expr else _empty_cx
                    col_record["expression"] = col_expr
                    col_record["complexity"] = complexity
                    calc_cols.append({
                        "name":       col_name,
                        "table":      tbl_name,
                        "expression": col_expr,
                        "data_type":  col.get("dataType", ""),
                        "complexity": complexity,
                    })
                tbl_cols.append(col_record)

            # Measures
            for m in tbl.get("measures", []):
                expr       = m.get("expression", "") or ""
                complexity = _score_measure_complexity(expr)
                deps       = _extract_dax_dependencies(expr)
                enriched   = {
                    "name":           m.get("name", ""),
                    "table":          tbl_name,
                    "expression":     expr,
                    "display_folder": m.get("displayFolder", "") or "",
                    "complexity":     complexity,
                    "dependencies":   deps,
                }
                measures.append(enriched)
                if enriched["name"]:
                    measure_dep_map[enriched["name"]] = enriched

            tables_out.append({
                "name":          tbl_name,
                "storage_mode":  tbl.get("storageMode", "Import") or "Import",
                "is_hidden":     is_hidden,
                "is_calculated": bool(tbl_expr.strip()),
                "columns":       tbl_cols,
            })

        raw_rel_list = ds.get("relationships", [])
        rel_count    = len(raw_rel_list)
        vis_tables   = [t for t in tables_out if not t["is_hidden"]]
        total_score  = sum(m["complexity"]["score"] for m in measures)
        # Build structured relationship list
        relationships_list_s: list[dict] = []
        for rel in raw_rel_list:
            # Scanner API returns fromCardinality/toCardinality as strings like "many"/"one"
            from_card_s = (rel.get("fromCardinality") or "many").lower()
            to_card_s   = (rel.get("toCardinality")   or "one").lower()
            relationships_list_s.append({
                "from_table":   rel.get("fromTable", ""),
                "from_column":  rel.get("fromColumn", ""),
                "to_table":     rel.get("toTable", ""),
                "to_column":    rel.get("toColumn", ""),
                "cardinality":  f"{from_card_s}:{to_card_s}",
                "cross_filter": rel.get("crossFilteringBehavior", "oneDirection"),
                "is_active":    rel.get("isActive", True),
            })
        model_score = min(100,
            total_score
            + len(calc_cols)   * 2
            + len(calc_tables) * 3
            + rel_count
        )

        result_map[ds_id] = {
            "tables":                  tables_out,
            "measures":                measures,
            "calculated_columns":      calc_cols,
            "calculated_tables":       calc_tables,
            "relationships":           relationships_list_s,
            "relationship_count":      rel_count,
            "complexity_score":        model_score,
            "table_count":             len(vis_tables),
            "measure_count":           len(measures),
            "calculated_column_count": len(calc_cols),
            "calculated_table_count":  len(calc_tables),
            "info_supported":          True,
            "_measure_dep_map":        measure_dep_map,
        }

    logger.info(
        "Scanner API returned metadata for %d dataset(s) in workspace %s",
        len(result_map), workspace_id,
    )
    return result_map


# ── Workspace listing ─────────────────────────────────────────────────────────

def _fetch_all_workspaces(token: str) -> list[dict]:
    """
    Fetch all workspaces the user can access.

    Strategy:
    1. Regular /groups endpoint (user-scoped, workspaces the user is a member of).
       Uses $top=5000 to avoid 100-item default limit.
    2. Admin /admin/groups endpoint (tenant-admin scope).
       Falls back if regular API returns fewer than expected or admin role detected.
       Merges results (dedup by id) to ensure complete coverage.
    """
    # Regular user-scoped workspaces (supports $top)
    regular = _pbi_get(
        token,
        "/groups?$filter=type eq 'Workspace'&$top=5000",
    )
    if not isinstance(regular, list):
        regular = []

    ws_map: dict[str, dict] = {ws["id"]: ws for ws in regular if ws.get("id")}

    # Try admin API to catch workspaces where user has admin role but is not a member
    try:
        admin_ws = _pbi_get(token, "/admin/groups?$filter=type eq 'Workspace'&$top=5000")
        if isinstance(admin_ws, list) and admin_ws:
            for ws in admin_ws:
                wid = ws.get("id")
                if wid and wid not in ws_map:
                    ws_map[wid] = ws
            logger.info(
                "Admin API returned %d workspaces (%d new beyond regular API)",
                len(admin_ws),
                len(ws_map) - len(regular),
            )
    except Exception as exc:
        logger.debug("Admin workspace API unavailable (normal for non-admins): %s", exc)

    return list(ws_map.values())


def list_workspaces(auth_id: str) -> list[dict]:
    token = _get_token(auth_id)
    raw   = _fetch_all_workspaces(token)

    workspaces: list[dict] = []
    for ws in raw:
        ws_id = ws.get("id", "")
        raw_datasets = _pbi_get(token, f"/groups/{ws_id}/datasets?$top=5000")
        ds_count     = len(raw_datasets) if isinstance(raw_datasets, list) else 0
        raw_reports  = _pbi_get(token, f"/groups/{ws_id}/reports")
        rpt_count    = len(raw_reports)  if isinstance(raw_reports,  list) else 0
        workspaces.append({
            "id":           ws_id,
            "name":         ws.get("name", ""),
            "type":         ws.get("type", "Workspace"),
            "state":        ws.get("state", "Active"),
            "capacity_id":  ws.get("capacityId", ""),
            "dataset_count": ds_count,
            "report_count":  rpt_count,
        })
    return workspaces


# ── Workspace item listing (for pre-assessment picker) ───────────────────────

def list_workspace_items(auth_id: str, workspace_ids: list[str]) -> list[dict]:
    """
    Return datasets and reports (id + name) for each selected workspace.
    Used to populate the model/report picker before starting an assessment.
    Fetches all selected workspaces in parallel.
    """
    token = _get_token(auth_id)

    def _fetch(ws_id: str) -> dict:
        datasets = _pbi_get(token, f"/groups/{ws_id}/datasets?$top=5000")
        reports  = _pbi_get(token, f"/groups/{ws_id}/reports?$top=5000")
        return {
            "workspace_id": ws_id,
            "datasets": [
                {"id": ds["id"], "name": ds["name"]}
                for ds in (datasets if isinstance(datasets, list) else [])
                if ds.get("id")
                and ds.get("name") not in _SKIP_MODEL_NAMES
                and not any(frag.lower() in (ds.get("name") or "").lower() for frag in _SKIP_MODEL_NAME_FRAGMENTS)
            ],
            "reports": [
                {
                    "id":          r["id"],
                    "name":        r["name"],
                    "report_type": r.get("reportType", "PowerBIReport"),
                }
                for r in (reports if isinstance(reports, list) else [])
                if r.get("id")
            ],
        }

    results: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as exe:
        futs = {exe.submit(_fetch, ws_id): ws_id for ws_id in workspace_ids}
        for fut in concurrent.futures.as_completed(futs):
            try:
                results.append(fut.result())
            except Exception as exc:
                ws_id = futs[fut]
                logger.warning("Failed to fetch items for workspace %s: %s", ws_id, exc)
                results.append({"workspace_id": ws_id, "datasets": [], "reports": []})

    results.sort(key=lambda x: x["workspace_id"])
    return results


# ── Main assessment runner ────────────────────────────────────────────────────

def run_fabric_assessment(
    fabric_session_id:    str,
    auth_id:              str,
    workspace_ids:        Optional[list[str]] = None,
    selected_dataset_ids: Optional[set[str]]  = None,
    selected_report_ids:  Optional[set[str]]  = None,
    on_progress:          Optional[Any]       = None,
) -> dict:
    """
    Full Fabric workspace assessment.

    For each workspace:
      1. Semantic Models  — INFO.* DAX for tables, measures (+ complexity + deps),
                            calculated columns, calculated tables, relationships.
      2. Interactive Reports — PBIX download → page-by-page visual field analysis.
                               Falls back to pages API if PBIX unavailable.
      3. Paginated Reports  — metadata only (RDL format; no visual API support).

    selected_dataset_ids / selected_report_ids: optional sets of IDs to assess.
    When provided, only those models/reports are included; others are skipped.

    Returns structured results dict (no _measure_dep_map keys in output).
    Raises CancelledError if the assessment is stopped via request_cancel().
    """
    cancel_flag = _register_cancel_flag(fabric_session_id)

    def _check_cancel():
        if cancel_flag.is_set():
            raise RuntimeError("Assessment cancelled by user.")

    def _progress(msg: str):
        _check_cancel()
        logger.info("[fabric:%s] %s", fabric_session_id, msg)
        if on_progress:
            on_progress(msg)

    try:
        return _run_assessment_inner(
            fabric_session_id, auth_id, workspace_ids,
            selected_dataset_ids, selected_report_ids,
            _progress, _check_cancel,
        )
    finally:
        _deregister_cancel_flag(fabric_session_id)


def _run_assessment_inner(
    fabric_session_id:    str,  # noqa: ARG001 — kept for logging context if needed
    auth_id:              str,
    workspace_ids:        Optional[list[str]],
    selected_dataset_ids: Optional[set[str]],
    selected_report_ids:  Optional[set[str]],
    _progress,
    _check_cancel,
) -> dict:
    token = _get_token(auth_id)

    # Acquire a Fabric-scoped token once for getDefinition API calls.
    # Uses the same credential — no extra login prompt.
    try:
        fabric_token = _get_fabric_token(auth_id)
    except Exception:
        fabric_token = token   # fall back to PBI token; getDefinition may still work

    # ── Progress counters — thread-safe (shared across workspaces) ──────────
    _prog_state: dict = {
        "md": 0, "mt": 0,   # models done / total
        "rd": 0, "rt": 0,   # reports done / total
    }
    _prog_lock = threading.Lock()

    def _progress_counted(msg: str) -> None:
        """Emit a JSON-encoded progress message that includes model/report counts."""
        with _prog_lock:
            payload = json.dumps({
                "msg": msg,
                "md":  _prog_state["md"],
                "mt":  _prog_state["mt"],
                "rd":  _prog_state["rd"],
                "rt":  _prog_state["rt"],
            }, ensure_ascii=False)
        _progress(payload)

    def _inc_prog(key: str) -> None:
        """Thread-safely increment one progress counter."""
        with _prog_lock:
            _prog_state[key] += 1

    # ── Parallel worker limits ────────────────────────────────────────────────
    # Models:  each calls Fabric REST API (getDefinition LRO) — I/O bound.
    # Reports: each downloads/parses a PBIX file via HTTP — I/O bound.
    # 5 workers saturates the API rate limits without triggering throttling.
    _MODEL_WORKERS  = 5
    _REPORT_WORKERS = 5

    # ── 1. Workspaces ─────────────────────────────────────────────────────────
    _progress("Fetching workspaces…")
    raw_workspaces = _fetch_all_workspaces(token)
    if not isinstance(raw_workspaces, list):
        raw_workspaces = []

    if workspace_ids:
        selected       = set(workspace_ids)
        raw_workspaces = [ws for ws in raw_workspaces if ws.get("id") in selected]
        _progress(f"Assessing {len(raw_workspaces)} selected workspace(s)…")
    else:
        _progress(f"Assessing all {len(raw_workspaces)} workspace(s)…")

    workspaces: list[dict] = []
    total_measures    = 0
    total_calc_tables = 0
    total_calc_cols   = 0
    total_rels        = 0
    total_visuals     = 0
    total_reports     = 0
    total_paginated   = 0
    total_datasets    = 0

    for ws in raw_workspaces:
        _check_cancel()
        ws_id   = ws.get("id",   "")
        ws_name = ws.get("name", "")
        _progress(f"Workspace: {ws_name}")

        # ── 2. Semantic Models ───────────────────────────────────────────────
        _progress(f"  Fetching semantic models in '{ws_name}'…")
        raw_datasets = _pbi_get(token, f"/groups/{ws_id}/datasets?$top=5000")
        if not isinstance(raw_datasets, list):
            raw_datasets = []

        # Apply user-selected model filter (empty set = skip all models)
        if selected_dataset_ids is not None:
            raw_datasets = [d for d in raw_datasets if d.get("id") in selected_dataset_ids]

        # Count non-skipped models for the progress bar
        with _prog_lock:
            _prog_state["mt"] += sum(
                1 for d in raw_datasets if d.get("name", "") not in _SKIP_MODEL_NAMES
            )

        # Scanner API: one admin call covers the whole workspace.
        # Fetched once here; read-only in worker threads below.
        scanner_data: dict[str, dict] = {}
        try:
            scanner_data = _get_workspace_scanner_data(token, ws_id)
            if scanner_data:
                _progress(
                    f"  Scanner API: metadata ready for {len(scanner_data)} model(s) "
                    "(used as fallback if getDefinition is unavailable)."
                )
        except Exception:
            pass

        # ── Dataset worker — runs in thread pool ─────────────────────────────
        def _process_dataset(ds: dict) -> Optional[dict]:
            ds_id   = ds.get("id",   "")
            ds_name = ds.get("name", "")
            if ds_name in _SKIP_MODEL_NAMES:
                return None
            if any(frag.lower() in ds_name.lower() for frag in _SKIP_MODEL_NAME_FRAGMENTS):
                logger.info("Skipping Fabric staging model: '%s'", ds_name)
                return None
            try:
                _check_cancel()
            except RuntimeError:
                return None

            _progress_counted(f"Analysing model: {ds_name}")

            # Priority 1: Fabric getDefinition (TMDL) — no Premium required
            details: dict = {}
            try:
                tmdl_files = _get_model_definition(fabric_token, ws_id, ds_id)
                if tmdl_files:
                    details = _parse_model_definition(tmdl_files)
                    logger.info(
                        "getDefinition succeeded for '%s' (%d TMDL parts)",
                        ds_name, len(tmdl_files),
                    )
            except Exception as exc:
                logger.debug("getDefinition failed for %s: %s", ds_id, exc)

            # Priority 2: Scanner API (admin-only, any capacity)
            if not details and ds_id in scanner_data:
                details = dict(scanner_data[ds_id])
                logger.info("Using Scanner API metadata for '%s'", ds_name)

            # Priority 3: DAX executeQueries (Premium capacity required)
            if not details:
                try:
                    details = _get_dataset_details(token, ws_id, ds_id)
                    if not details.get("info_supported"):
                        logger.info("No metadata available for '%s'", ds_name)
                except Exception as exc:
                    logger.warning("All metadata methods failed for %s: %s", ds_id, exc)
                    details = _empty_details()

            if not details:
                details = _empty_details()

            dep_map = details.pop("_measure_dep_map", {})

            # Storage mode
            visible_modes = {
                t["storage_mode"] for t in details["tables"] if not t.get("is_hidden")
            }
            if len(visible_modes) > 1:
                overall_mode = "Composite"
            elif visible_modes:
                overall_mode = next(iter(visible_modes))
            else:
                api_mode = (ds.get("storageMode") or ds.get("StorageMode") or "").strip()
                overall_mode = api_mode if api_mode else "Import"

            _inc_prog("md")

            return {
                "record": {
                    "id":                          ds_id,
                    "name":                        ds_name,
                    "configured_by":               ds.get("configuredBy", ""),
                    "is_refreshable":              ds.get("isRefreshable", False),
                    "is_on_prem_gateway_required": ds.get("isOnPremGatewayRequired", False),
                    "web_url":                     ds.get("webUrl", ""),
                    "storage_mode":                overall_mode,
                    **details,
                },
                "dep_map": dep_map,
            }

        # ── Run model analysis in parallel ───────────────────────────────────
        datasets:        list[dict] = []
        ws_measure_deps: dict[str, dict] = {}

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=_MODEL_WORKERS, thread_name_prefix="fabric-model"
        ) as exe:
            futs = {exe.submit(_process_dataset, ds): ds for ds in raw_datasets}
            for fut in concurrent.futures.as_completed(futs):
                if _prog_state.get("_cancelled"):
                    break
                try:
                    result = fut.result()
                    if result:
                        datasets.append(result["record"])
                        ws_measure_deps.update(result["dep_map"])
                        rec = result["record"]
                        total_measures    += rec.get("measure_count",           0)
                        total_calc_tables += rec.get("calculated_table_count",  0)
                        total_calc_cols   += rec.get("calculated_column_count", 0)
                        total_rels        += rec.get("relationship_count",      0)
                        total_datasets    += 1
                except RuntimeError as exc:
                    if "cancelled" in str(exc).lower():
                        with _prog_lock:
                            _prog_state["_cancelled"] = True
                    else:
                        logger.warning("Dataset processing error: %s", exc)
                except Exception as exc:
                    logger.warning("Dataset processing error: %s", exc)

        _check_cancel()

        # ── 3. Reports (interactive + paginated) ─────────────────────────────
        _progress(f"  Fetching reports in '{ws_name}'…")
        raw_reports = _pbi_get(token, f"/groups/{ws_id}/reports?$top=5000")
        if not isinstance(raw_reports, list):
            raw_reports = []

        # Apply user-selected report filter (empty set = skip all reports)
        if selected_report_ids is not None:
            raw_reports = [r for r in raw_reports if r.get("id") in selected_report_ids]

        # Count interactive reports for the progress bar
        with _prog_lock:
            _prog_state["rt"] += sum(
                1 for r in raw_reports if r.get("reportType", "") != "PaginatedReport"
            )

        # ws_measure_deps is now fully built — safe to read from report workers
        _frozen_dep_map = dict(ws_measure_deps)

        # ── Report worker — runs in thread pool ──────────────────────────────
        def _process_report(rpt: dict) -> Optional[dict]:
            rpt_id       = rpt.get("id",        "")
            rpt_name     = rpt.get("name",       "")
            is_paginated = rpt.get("reportType", "") == "PaginatedReport"

            if is_paginated:
                return {
                    "id":           rpt_id,
                    "name":         rpt_name,
                    "report_type":  "PaginatedReport",
                    "is_paginated": True,
                    "dataset_id":   rpt.get("datasetId", ""),
                    "web_url":      rpt.get("webUrl",    ""),
                    "page_count":   None,
                    "visual_count": 0, "bookmark_count": 0,
                    "pages":        [], "layout_parsed": False,
                }

            try:
                _check_cancel()
            except RuntimeError:
                return None

            _progress_counted(f"Analysing report: {rpt_name}")
            try:
                rpt_details = _get_report_visual_details(
                    token, ws_id, rpt_id, _frozen_dep_map,
                    fabric_token=fabric_token,
                    workspace_id=ws_id,
                )
            except Exception as exc:
                logger.debug("Report details failed for %s: %s", rpt_id, exc)
                rpt_details = {
                    "page_count": None, "visual_count": 0,
                    "bookmark_count": 0, "pages": [], "layout_parsed": False,
                    "connections": {}, "mashup_queries": [],
                }

            _inc_prog("rd")

            return {
                "id":           rpt_id,
                "name":         rpt_name,
                "report_type":  rpt.get("reportType", "PowerBIReport"),
                "is_paginated": False,
                "dataset_id":   rpt.get("datasetId", ""),
                "web_url":      rpt.get("webUrl",    ""),
                **rpt_details,
            }

        # ── Run report analysis in parallel ──────────────────────────────────
        reports: list[dict] = []

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=_REPORT_WORKERS, thread_name_prefix="fabric-report"
        ) as exe:
            futs = {exe.submit(_process_report, rpt): rpt for rpt in raw_reports}
            for fut in concurrent.futures.as_completed(futs):
                if _prog_state.get("_cancelled"):
                    break
                try:
                    result = fut.result()
                    if result:
                        if result["is_paginated"]:
                            total_paginated += 1
                        else:
                            total_reports += 1
                            total_visuals += result.get("visual_count", 0)
                        reports.append(result)
                except RuntimeError as exc:
                    if "cancelled" in str(exc).lower():
                        with _prog_lock:
                            _prog_state["_cancelled"] = True
                    else:
                        logger.warning("Report processing error: %s", exc)
                except Exception as exc:
                    logger.warning("Report processing error: %s", exc)

        _check_cancel()

        workspaces.append({
            "id":                    ws_id,
            "name":                  ws_name,
            "type":                  ws.get("type",       "Workspace"),
            "state":                 ws.get("state",      "Active"),
            "is_read_only":          ws.get("isReadOnly", False),
            "capacity_id":           ws.get("capacityId", ""),
            "datasets":              datasets,
            "reports":               reports,
            "dataset_count":         len(datasets),
            "report_count":          len([r for r in reports if not r["is_paginated"]]),
            "paginated_report_count": len([r for r in reports if r["is_paginated"]]),
        })

    results = {
        "assessed_at": datetime.now(timezone.utc).isoformat(),
        "workspaces":  workspaces,
        "summary": {
            "workspace_count":          len(workspaces),
            "dataset_count":            total_datasets,
            "report_count":             total_reports,
            "paginated_report_count":   total_paginated,
            "total_measures":           total_measures,
            "total_calculated_tables":  total_calc_tables,
            "total_calculated_columns": total_calc_cols,
            "total_relationships":      total_rels,
            "total_visuals":            total_visuals,
        },
    }
    _progress("Assessment complete.")
    return results


# ── Excel Report Generation ───────────────────────────────────────────────────

def generate_fabric_excel(results: dict) -> bytes:
    """
    Generate a multi-sheet Excel workbook from Fabric assessment results.
    Uses semantic-link-labs data structures where available.
    Returns raw bytes of the .xlsx file.
    """
    try:
        from openpyxl import Workbook
        from openpyxl.styles import (
            Font, PatternFill, Alignment, Border, Side, numbers,
        )
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise RuntimeError("openpyxl is required for Excel export.")

    wb = Workbook()

    # ── Colour palette ────────────────────────────────────────────────────────
    _HDR_FILL  = PatternFill("solid", fgColor="1E3A5F")   # dark navy
    _HDR_FONT  = Font(color="FFFFFF", bold=True, name="Calibri", size=10)
    _TITLE_FONT = Font(bold=True, name="Calibri", size=14, color="1E3A5F")
    _SUBHDR_FILL = PatternFill("solid", fgColor="D6E4F7")
    _SUBHDR_FONT = Font(bold=True, name="Calibri", size=10, color="1E3A5F")
    _EVEN_FILL = PatternFill("solid", fgColor="F5F9FF")
    _THIN_BORDER = Border(
        left=Side(style="thin", color="D0D8E4"),
        right=Side(style="thin", color="D0D8E4"),
        top=Side(style="thin", color="D0D8E4"),
        bottom=Side(style="thin", color="D0D8E4"),
    )
    _COMPLEXITY_FILLS = {
        "None":         PatternFill("solid", fgColor="F1F5F9"),
        "Simple":       PatternFill("solid", fgColor="D1FAE5"),
        "Moderate":     PatternFill("solid", fgColor="FEF3C7"),
        "Complex":      PatternFill("solid", fgColor="FFEDD5"),
        "Very Complex": PatternFill("solid", fgColor="FEE2E2"),
    }

    def _style_header_row(ws, row_num: int, col_count: int, fill=None):
        for col in range(1, col_count + 1):
            cell = ws.cell(row=row_num, column=col)
            cell.fill  = fill or _HDR_FILL
            cell.font  = _HDR_FONT if (fill is None) else _SUBHDR_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = _THIN_BORDER

    def _style_data_row(ws, row_num: int, col_count: int, even: bool):
        for col in range(1, col_count + 1):
            cell = ws.cell(row=row_num, column=col)
            if even:
                cell.fill = _EVEN_FILL
            cell.font   = Font(name="Calibri", size=10)
            cell.border = _THIN_BORDER
            cell.alignment = Alignment(vertical="center", wrap_text=False)

    def _auto_width(ws, min_w=8, max_w=60):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except Exception:
                    pass
            ws.column_dimensions[col_letter].width = max(min_w, min(max_w, max_len + 2))

    def _write_sheet(ws, title: str, headers: list[str], rows: list[list]):
        # Title row
        ws.row_dimensions[1].height = 24
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
        tc = ws.cell(row=1, column=1, value=title)
        tc.font      = _TITLE_FONT
        tc.fill      = PatternFill("solid", fgColor="EBF3FB")
        tc.alignment = Alignment(horizontal="left", vertical="center")
        # Header row
        for ci, h in enumerate(headers, 1):
            ws.cell(row=2, column=ci, value=h)
        _style_header_row(ws, 2, len(headers))
        ws.row_dimensions[2].height = 18
        # Data rows
        for ri, row_data in enumerate(rows, 3):
            for ci, val in enumerate(row_data, 1):
                ws.cell(row=ri, column=ci, value=val)
            _style_data_row(ws, ri, len(headers), (ri % 2 == 0))
        ws.freeze_panes = "A3"
        _auto_width(ws)

    summary  = results.get("summary", {})
    wss      = results.get("workspaces", [])
    assessed = results.get("assessed_at", "")

    # ── Sheet 1: Summary ──────────────────────────────────────────────────────
    ws_sum = wb.active
    ws_sum.title = "Summary"
    sum_headers = ["Metric", "Value"]
    sum_rows = [
        ["Assessed At",          assessed],
        ["Workspaces",           summary.get("workspace_count", 0)],
        ["Semantic Models",      summary.get("dataset_count", 0)],
        ["Interactive Reports",  summary.get("report_count", 0)],
        ["Paginated Reports",    summary.get("paginated_report_count", 0)],
        ["Total Measures",       summary.get("total_measures", 0)],
        ["Calculated Tables",    summary.get("total_calculated_tables", 0)],
        ["Calculated Columns",   summary.get("total_calculated_columns", 0)],
        ["Relationships",        summary.get("total_relationships", 0)],
        ["Total Visuals",        summary.get("total_visuals", 0)],
    ]
    _write_sheet(ws_sum, "Fabric Assessment Summary", sum_headers, sum_rows)

    # ── Sheet 2: Workspaces ───────────────────────────────────────────────────
    ws_workspaces = wb.create_sheet("Workspaces")
    _write_sheet(ws_workspaces, "Workspaces", [
        "Workspace Name", "Type", "State", "Capacity ID",
        "Semantic Models", "Interactive Reports", "Paginated Reports",
    ], [
        [
            ws["name"], ws.get("type", ""), ws.get("state", ""),
            ws.get("capacity_id", ""),
            ws.get("dataset_count", 0), ws.get("report_count", 0),
            ws.get("paginated_report_count", 0),
        ]
        for ws in wss
    ])

    # ── Sheet 3: Semantic Models ──────────────────────────────────────────────
    ws_models = wb.create_sheet("Semantic Models")
    model_rows = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            model_rows.append([
                ws["name"], ds["name"],
                ds.get("configured_by", ""),
                ds.get("storage_mode", ""),
                ds.get("table_count", 0),
                ds.get("measure_count", 0),
                ds.get("calculated_column_count", 0),
                ds.get("calculated_table_count", 0),
                ds.get("relationship_count", 0),
                ds.get("complexity_score", 0),
                "Yes" if ds.get("info_supported") else "No",
            ])
    _write_sheet(ws_models, "Semantic Models", [
        "Workspace", "Model Name", "Owner", "Storage Mode",
        "Tables", "Measures", "Calc. Columns", "Calc. Tables",
        "Relationships", "Complexity Score", "Metadata Available",
    ], model_rows)

    # ── Sheet 4: Tables ───────────────────────────────────────────────────────
    ws_tables = wb.create_sheet("Tables")
    table_rows = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            for tbl in ds.get("tables", []):
                table_rows.append([
                    ws["name"], ds["name"], tbl["name"],
                    tbl.get("storage_mode", ""),
                    "Yes" if tbl.get("is_hidden")     else "No",
                    "Yes" if tbl.get("is_calculated") else "No",
                ])
    _write_sheet(ws_tables, "Tables", [
        "Workspace", "Model", "Table Name",
        "Storage Mode", "Hidden", "Calculated",
    ], table_rows)

    # ── Sheet 5: Measures ─────────────────────────────────────────────────────
    ws_meas = wb.create_sheet("Measures")
    meas_rows = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            for m in ds.get("measures", []):
                cx = m.get("complexity", {})
                meas_rows.append([
                    ws["name"], ds["name"],
                    m.get("table", ""), m["name"],
                    m.get("display_folder", ""),
                    cx.get("level", ""),
                    cx.get("score", 0),
                    cx.get("function_count", 0),
                    cx.get("nesting_depth", 0),
                    cx.get("dependency_count", 0),
                    ", ".join(cx.get("complex_functions", [])),
                    m.get("expression", ""),
                ])
    # Apply complexity colour to level column (col 6)
    _write_sheet(ws_meas, "Measures (with DAX Complexity)", [
        "Workspace", "Model", "Table", "Measure Name",
        "Display Folder", "Complexity Level", "Score",
        "Function Count", "Nesting Depth", "Column Refs",
        "Complex Functions", "DAX Expression",
    ], meas_rows)
    # Colour complexity level cells
    for ri, row in enumerate(meas_rows, 3):
        level = row[5]
        fill  = _COMPLEXITY_FILLS.get(level)
        if fill:
            ws_meas.cell(row=ri, column=6).fill = fill

    # ── Sheet 6: Calculated Columns ───────────────────────────────────────────
    ws_cc = wb.create_sheet("Calculated Columns")
    cc_rows = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            for c in ds.get("calculated_columns", []):
                cx = c.get("complexity", {})
                cc_rows.append([
                    ws["name"], ds["name"],
                    c.get("table", ""), c["name"],
                    c.get("data_type", ""),
                    cx.get("level", ""),
                    cx.get("score", 0),
                    cx.get("function_count", 0),
                    cx.get("nesting_depth", 0),
                    c.get("expression", ""),
                ])
    _write_sheet(ws_cc, "Calculated Columns (with Complexity)", [
        "Workspace", "Model", "Table", "Column Name",
        "Data Type", "Complexity Level", "Score",
        "Function Count", "Nesting Depth", "DAX Expression",
    ], cc_rows)
    for ri, row in enumerate(cc_rows, 3):
        level = row[5]
        fill  = _COMPLEXITY_FILLS.get(level)
        if fill:
            ws_cc.cell(row=ri, column=6).fill = fill

    # ── Sheet 7: Calculated Tables ────────────────────────────────────────────
    ws_ct = wb.create_sheet("Calculated Tables")
    ct_rows = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            for t in ds.get("calculated_tables", []):
                cx = t.get("complexity", {})
                ct_rows.append([
                    ws["name"], ds["name"],
                    t["name"],
                    cx.get("level", ""),
                    cx.get("score", 0),
                    cx.get("function_count", 0),
                    cx.get("nesting_depth", 0),
                    t.get("expression", ""),
                ])
    _write_sheet(ws_ct, "Calculated Tables (with Complexity)", [
        "Workspace", "Model", "Table Name",
        "Complexity Level", "Score", "Function Count",
        "Nesting Depth", "DAX Expression",
    ], ct_rows)
    for ri, row in enumerate(ct_rows, 3):
        level = row[3]
        fill  = _COMPLEXITY_FILLS.get(level)
        if fill:
            ws_ct.cell(row=ri, column=4).fill = fill

    # ── Sheet 8: Relationships ────────────────────────────────────────────────
    ws_rels = wb.create_sheet("Relationships")
    rel_rows = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            for r in ds.get("relationships", []):
                rel_rows.append([
                    ws["name"], ds["name"],
                    r.get("from_table", ""),
                    r.get("from_column", ""),
                    r.get("to_table", ""),
                    r.get("to_column", ""),
                    r.get("cardinality", ""),
                    r.get("cross_filter", ""),
                    "Yes" if r.get("is_active", True) else "No",
                ])
    _write_sheet(ws_rels, "Relationships", [
        "Workspace", "Model",
        "From Table", "From Column",
        "To Table", "To Column",
        "Cardinality", "Cross Filter", "Active",
    ], rel_rows)

    # ── Sheet 9: Reports ──────────────────────────────────────────────────────
    ws_rpts = wb.create_sheet("Reports")
    rpt_rows = []
    for ws in wss:
        for r in ws.get("reports", []):
            rpt_rows.append([
                ws["name"], r["name"],
                "Paginated" if r.get("is_paginated") else "Interactive",
                r.get("page_count", 0) or 0,
                r.get("visual_count", 0),
                r.get("bookmark_count", 0),
                "Yes" if r.get("layout_parsed") else "No",
                r.get("web_url", ""),
            ])
    _write_sheet(ws_rpts, "Reports", [
        "Workspace", "Report Name", "Type",
        "Pages", "Visuals", "Bookmarks",
        "Field Analysis", "URL",
    ], rpt_rows)

    # ── Sheet 10: Report Visuals ──────────────────────────────────────────────
    ws_vis = wb.create_sheet("Report Visuals")
    vis_rows = []
    for ws in wss:
        for r in ws.get("reports", []):
            if r.get("is_paginated"):
                continue
            for page in r.get("pages", []):
                for v in page.get("visuals", []):
                    vis_rows.append([
                        ws["name"], r["name"],
                        page.get("name", ""), v.get("type", ""),
                        v.get("title", ""), v.get("field_count", 0),
                        ", ".join(
                            f.get("name", "") for f in v.get("fields", [])[:5]
                        ),
                    ])
    _write_sheet(ws_vis, "Report Visuals", [
        "Workspace", "Report", "Page", "Visual Type",
        "Title", "Field Count", "Fields (first 5)",
    ], vis_rows)

    # ── Sheet 11: Bookmarks ───────────────────────────────────────────────────
    ws_bm = wb.create_sheet("Bookmarks")
    bm_rows = []
    for ws in wss:
        for r in ws.get("reports", []):
            for bm in r.get("bookmarks", []):
                bm_rows.append([
                    ws["name"], r["name"],
                    bm.get("name", ""), bm.get("target_page", ""),
                ])
    _write_sheet(ws_bm, "Bookmarks", [
        "Workspace", "Report", "Bookmark Name", "Target Page",
    ], bm_rows)

    # ── Sheet 12: Complexity Analysis ─────────────────────────────────────────
    ws_cx = wb.create_sheet("Complexity Analysis")
    cx_all = []
    for ws in wss:
        for ds in ws.get("datasets", []):
            for m in ds.get("measures", []):
                cx = m.get("complexity", {})
                if cx.get("score", 0) > 0:
                    cx_all.append({
                        "workspace": ws["name"], "model": ds["name"],
                        "type": "Measure", "name": m["name"],
                        "table": m.get("table", ""),
                        "level": cx.get("level", ""),
                        "score": cx.get("score", 0),
                        "expression": m.get("expression", ""),
                    })
            for c in ds.get("calculated_columns", []):
                cx = c.get("complexity", {})
                if cx.get("score", 0) > 0:
                    cx_all.append({
                        "workspace": ws["name"], "model": ds["name"],
                        "type": "Calculated Column", "name": c["name"],
                        "table": c.get("table", ""),
                        "level": cx.get("level", ""),
                        "score": cx.get("score", 0),
                        "expression": c.get("expression", ""),
                    })
            for t in ds.get("calculated_tables", []):
                cx = t.get("complexity", {})
                if cx.get("score", 0) > 0:
                    cx_all.append({
                        "workspace": ws["name"], "model": ds["name"],
                        "type": "Calculated Table", "name": t["name"],
                        "table": t["name"],
                        "level": cx.get("level", ""),
                        "score": cx.get("score", 0),
                        "expression": t.get("expression", ""),
                    })
    cx_all.sort(key=lambda x: x["score"], reverse=True)
    cx_rows = [
        [c["workspace"], c["model"], c["type"], c["name"],
         c["table"], c["level"], c["score"], c["expression"]]
        for c in cx_all
    ]
    _write_sheet(ws_cx, "Complexity Analysis (All Items Ranked)", [
        "Workspace", "Model", "Type", "Name",
        "Table", "Complexity Level", "Score", "DAX Expression",
    ], cx_rows)
    for ri, row in enumerate(cx_rows, 3):
        level = row[5]
        fill  = _COMPLEXITY_FILLS.get(level)
        if fill:
            ws_cx.cell(row=ri, column=6).fill = fill

    # Serialise to bytes
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
