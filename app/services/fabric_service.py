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

Visual Analysis:
        Downloads PBIX via Export endpoint → parses Report/Layout JSON (UTF-16-LE).
        Extracts visual types + prototypeQuery field bindings per page.
        Resolves measures → DAX dependency columns+tables via expression parsing.

Measure Complexity:
        Scores each measure expression by DAX function tier, nesting depth,
        and column reference count. Returns level: Simple/Moderate/Complex/Very Complex.
"""

import io
import json
import re
import threading
import uuid
import zipfile
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
            logger.debug("executeQueries not supported (400) for dataset %s", dataset_id)
            return None
        elif resp.status_code == 403:
            logger.debug("executeQueries blocked (403) for dataset %s", dataset_id)
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


# ── PBIX layout download & parsing ───────────────────────────────────────────

def _download_report_layout(token: str, group_id: str, report_id: str) -> Optional[dict]:
    """
    Download the PBIX file and return the parsed Report/Layout JSON.
    Returns None if download fails, report is too large, or not a PBIX.
    """
    url = f"{PBI_BASE}/groups/{group_id}/reports/{report_id}/Export"
    try:
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=120,
            stream=True,
        )
        if resp.status_code != 200:
            logger.debug("PBIX export HTTP %s for report %s", resp.status_code, report_id)
            return None

        buf = io.BytesIO()
        for chunk in resp.iter_content(chunk_size=65536):
            buf.write(chunk)
            if buf.tell() > _MAX_PBIX_BYTES:
                logger.debug("PBIX >50 MB for report %s — skipping layout parse", report_id)
                return None
        buf.seek(0)

        with zipfile.ZipFile(buf, "r") as z:
            names_lower = {n.lower(): n for n in z.namelist()}
            layout_key  = names_lower.get("report/layout")
            if not layout_key:
                return None
            raw  = z.read(layout_key)
            # PBIX Layout is encoded in UTF-16-LE
            text = raw.decode("utf-16-le", errors="replace")
            return json.loads(text)

    except zipfile.BadZipFile:
        logger.debug("PBIX is not a valid ZIP for report %s", report_id)
    except Exception as exc:
        logger.debug("Failed to download/parse PBIX for report %s: %s", report_id, exc)
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


# ── Dataset details via DAX INFO.* ────────────────────────────────────────────

def _empty_details() -> dict:
    return {
        "tables": [], "measures": [], "calculated_columns": [],
        "calculated_tables": [], "relationship_count": 0,
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

    # ── Calculated columns ───────────────────────────────────────────────────
    raw_cols = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.COLUMNS()")
    calc_columns: list[dict] = []
    for r in (raw_cols or []):
        if _val_int(_row_val(r, "Type"), default=0) != 2:
            continue
        col_name = _row_val(r, "ExplicitName") or _row_val(r, "Name", default="")
        expr     = _row_val(r, "Expression", default="") or ""
        tid      = _val_int(_row_val(r, "TableID"))
        calc_columns.append({
            "name":       col_name,
            "table":      table_map.get(tid, {}).get("name", ""),
            "expression": expr,
        })

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
    raw_rels = _execute_dax(token, group_id, dataset_id, "EVALUATE INFO.RELATIONSHIPS()")
    relationship_count = len(raw_rels) if raw_rels else 0

    # ── Build table list ─────────────────────────────────────────────────────
    calc_table_names = {c["name"] for c in calc_tables}
    tables_out: list[dict] = []
    for info in table_map.values():
        tables_out.append({
            "name":          info["name"],
            "storage_mode":  info["storage_mode"],
            "is_hidden":     info["is_hidden"],
            "is_calculated": info["name"] in calc_table_names,
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
) -> dict:
    """
    Full report analysis:
      - Download PBIX → parse visual types, titles, and field bindings per page
      - Resolve Column, Measure, Aggregation, HierarchyLevel fields
      - Enrich Measure fields with DAX expression, complexity, and column dependencies
      - Fall back to pages API for page/visual counts if PBIX unavailable

    Returns:
        {page_count, visual_count, bookmark_count, pages: [...], layout_parsed: bool}
    """
    page_count     = 0
    visual_count   = 0
    bookmark_count = 0
    pages: list[dict] = []
    layout_parsed  = False

    # ── Attempt full PBIX layout parse ────────────────────────────────────────
    try:
        layout = _download_report_layout(token, group_id, report_id)
        if layout:
            pages        = _parse_layout_pages(layout, measure_dep_map)
            page_count   = len(pages)
            visual_count = sum(p["visual_count"] for p in pages)
            layout_parsed = True
    except Exception as exc:
        logger.debug("Layout parse failed for report %s: %s", report_id, exc)

    # ── Fallback: pages REST API (counts only) ────────────────────────────────
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
                                "visuals":      [],  # no field detail without PBIX
                            })
                    except Exception:
                        pass
        except Exception as exc:
            logger.debug("Pages API fallback failed for report %s: %s", report_id, exc)

    # ── Bookmarks ─────────────────────────────────────────────────────────────
    try:
        bm = _pbi_get(token, f"/groups/{group_id}/reports/{report_id}/bookmarks")
        if isinstance(bm, list):
            bookmark_count = len(bm)
    except Exception:
        pass

    return {
        "page_count":    page_count,
        "visual_count":  visual_count,
        "bookmark_count": bookmark_count,
        "pages":         pages,
        "layout_parsed": layout_parsed,
    }


# ── Workspace listing ─────────────────────────────────────────────────────────

def list_workspaces(auth_id: str) -> list[dict]:
    token = _get_token(auth_id)
    raw   = _pbi_get(token, "/groups?$filter=type eq 'Workspace'")
    if not isinstance(raw, list):
        raw = []

    workspaces: list[dict] = []
    for ws in raw:
        ws_id = ws.get("id", "")
        raw_datasets = _pbi_get(token, f"/groups/{ws_id}/datasets")
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


# ── Main assessment runner ────────────────────────────────────────────────────

def run_fabric_assessment(
    fabric_session_id: str,
    auth_id:           str,
    workspace_ids:     Optional[list[str]] = None,
    on_progress:       Optional[Any]       = None,
) -> dict:
    """
    Full Fabric workspace assessment.

    For each workspace:
      1. Semantic Models  — INFO.* DAX for tables, measures (+ complexity + deps),
                            calculated columns, calculated tables, relationships.
      2. Interactive Reports — PBIX download → page-by-page visual field analysis.
                               Falls back to pages API if PBIX unavailable.
      3. Paginated Reports  — metadata only (RDL format; no visual API support).

    Returns structured results dict (no _measure_dep_map keys in output).
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
        ws_id   = ws.get("id",   "")
        ws_name = ws.get("name", "")
        _progress(f"Workspace: {ws_name}")

        # ── 2. Semantic Models ───────────────────────────────────────────────
        _progress(f"  Fetching semantic models in '{ws_name}'…")
        raw_datasets = _pbi_get(token, f"/groups/{ws_id}/datasets")
        if not isinstance(raw_datasets, list):
            raw_datasets = []

        datasets:        list[dict] = []
        ws_measure_deps: dict[str, dict] = {}   # workspace-level measure map for reports

        for ds in raw_datasets:
            ds_id   = ds.get("id",   "")
            ds_name = ds.get("name", "")
            if ds_name in _SKIP_MODEL_NAMES:
                continue
            _progress(f"    Analysing model: {ds_name}")
            try:
                details = _get_dataset_details(token, ws_id, ds_id)
            except Exception as exc:
                logger.warning("Details failed for dataset %s: %s", ds_id, exc)
                details = _empty_details()

            # Accumulate workspace-level measure map
            ws_measure_deps.update(details.pop("_measure_dep_map", {}))

            total_measures    += details["measure_count"]
            total_calc_tables += details["calculated_table_count"]
            total_calc_cols   += details["calculated_column_count"]
            total_rels        += details.get("relationship_count", 0)
            total_datasets    += 1

            # Determine overall model storage mode
            visible_modes = {
                t["storage_mode"]
                for t in details["tables"]
                if not t.get("is_hidden")
            }
            if len(visible_modes) > 1:
                overall_mode = "Composite"
            elif visible_modes:
                overall_mode = next(iter(visible_modes))
            else:
                api_mode = (ds.get("storageMode") or ds.get("StorageMode") or "").strip()
                overall_mode = api_mode if api_mode else "Import"

            datasets.append({
                "id":                       ds_id,
                "name":                     ds_name,
                "configured_by":            ds.get("configuredBy", ""),
                "is_refreshable":           ds.get("isRefreshable", False),
                "is_on_prem_gateway_required": ds.get("isOnPremGatewayRequired", False),
                "web_url":                  ds.get("webUrl", ""),
                "storage_mode":             overall_mode,
                **details,
            })

        # ── 3. Reports (interactive + paginated) ─────────────────────────────
        _progress(f"  Fetching reports in '{ws_name}'…")
        raw_reports = _pbi_get(token, f"/groups/{ws_id}/reports")
        if not isinstance(raw_reports, list):
            raw_reports = []

        reports: list[dict] = []
        for rpt in raw_reports:
            rpt_id       = rpt.get("id",         "")
            rpt_name     = rpt.get("name",        "")
            is_paginated = rpt.get("reportType",  "") == "PaginatedReport"

            if is_paginated:
                total_paginated += 1
                # Paginated reports (RDL): metadata only — no visual API
                reports.append({
                    "id":              rpt_id,
                    "name":            rpt_name,
                    "report_type":     "PaginatedReport",
                    "is_paginated":    True,
                    "dataset_id":      rpt.get("datasetId", ""),
                    "web_url":         rpt.get("webUrl",    ""),
                    "page_count":      None,
                    "visual_count":    0,
                    "bookmark_count":  0,
                    "pages":           [],
                    "layout_parsed":   False,
                })
                continue

            # Interactive report — full visual analysis
            total_reports += 1
            _progress(f"    Analysing report: {rpt_name}")
            try:
                rpt_details = _get_report_visual_details(
                    token, ws_id, rpt_id, ws_measure_deps
                )
                total_visuals += rpt_details.get("visual_count", 0)
            except Exception as exc:
                logger.debug("Report details failed for %s: %s", rpt_id, exc)
                rpt_details = {
                    "page_count": None, "visual_count": 0,
                    "bookmark_count": 0, "pages": [], "layout_parsed": False,
                }

            reports.append({
                "id":             rpt_id,
                "name":           rpt_name,
                "report_type":    rpt.get("reportType", "PowerBIReport"),
                "is_paginated":   False,
                "dataset_id":     rpt.get("datasetId", ""),
                "web_url":        rpt.get("webUrl",    ""),
                **rpt_details,
            })

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
