"""
TMDL extraction helper.

Fetches a Fabric Semantic Model definition via the Fabric REST API
long-running operation (LRO) pattern, decodes the base64-encoded TMDL parts
into an in-memory dict, then provides focused parse functions for each
artifact type (tables, measures, calculated columns/tables, relationships,
hierarchies, perspectives, model metadata).

Nothing is written to disk.  All network I/O is synchronous (intended to be
called from a thread pool — see extractor.py).
"""

from __future__ import annotations

import base64
import re
import time
from typing import Any

import requests

from app.fabric_assessment.utils import get_fa_logger

logger = get_fa_logger(__name__)

_FABRIC_BASE = "https://api.fabric.microsoft.com/v1"

_STORAGE_MODE_MAP: dict[str, str] = {
    "import":       "Import",
    "directquery":  "DirectQuery",
    "dual":         "Composite",
    "directlake":   "DirectLake",
    "push":         "Push",
}


# ── Public fetch entry point ──────────────────────────────────────────────────

def fetch_tmdl_parts(
    token: str,
    workspace_id: str,
    dataset_id: str,
    max_wait_sec: int = 120,
    poll_interval: int = 5,
) -> dict[str, str]:
    """
    Export a Fabric Semantic Model as TMDL via the Fabric REST API.

    Implements the LRO (202 + Location) pattern from the reference sample:
      POST  /semanticModels/{id}/getDefinition?format=TMDL  → 202 Accepted
      GET   <Location>   (poll until Succeeded)
      GET   <Location>/result                               → {definition: {parts: [...]}}

    Returns {tmdl_path: utf8_content}, or {} on any failure.
    Requires Contributor (or higher) access on the model — no Premium needed.
    """
    headers: dict[str, str] = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = (
        f"{_FABRIC_BASE}/workspaces/{workspace_id}"
        f"/semanticModels/{dataset_id}/getDefinition?format=TMDL"
    )

    try:
        resp = requests.post(url, headers=headers, timeout=30)
    except requests.RequestException as exc:
        logger.warning("TMDL fetch POST failed: %s", exc)
        return {}

    if resp.status_code == 200:
        result: dict[str, Any] = resp.json()
    elif resp.status_code == 202:
        polled = _poll_lro(resp, headers, max_wait_sec, poll_interval)
        if polled is None:
            logger.warning("TMDL LRO timed out for dataset %s", dataset_id)
            return {}
        result = polled
    else:
        logger.warning(
            "TMDL fetch HTTP %s for dataset %s: %s",
            resp.status_code, dataset_id, resp.text[:300],
        )
        return {}

    files = _decode_parts(result)
    logger.info(
        "fetch_tmdl_parts: %d parts for dataset %s (workspace %s)",
        len(files), dataset_id, workspace_id,
    )
    return files


# ── LRO polling (mirrors the reference sample's polling loop) ─────────────────

def _poll_lro(
    initial_resp: requests.Response,
    headers: dict[str, str],
    max_wait_sec: int,
    poll_interval: int,
) -> dict[str, Any] | None:
    op_url: str = initial_resp.headers.get("Location", "")
    retry_after: int = int(initial_resp.headers.get("Retry-After", poll_interval))

    if not op_url:
        # Fallback: try to build operation URL from body operationId
        try:
            op_id: str = initial_resp.json().get("operationId", "")
            if op_id:
                op_url = f"https://api.fabric.microsoft.com/v1/operations/{op_id}"
        except Exception:
            pass

    if not op_url:
        logger.debug("LRO: no operation URL found in 202 response")
        return None

    deadline = time.monotonic() + max_wait_sec

    while time.monotonic() < deadline:
        time.sleep(retry_after)

        try:
            poll = requests.get(op_url, headers=headers, timeout=15)
        except requests.RequestException as exc:
            logger.debug("LRO poll request failed: %s", exc)
            retry_after = poll_interval
            continue

        if poll.status_code == 202:
            retry_after = int(poll.headers.get("Retry-After", poll_interval))
            continue

        if poll.status_code != 200:
            logger.debug("LRO poll unexpected HTTP %s", poll.status_code)
            break

        try:
            body: dict[str, Any] = poll.json()
        except Exception:
            break

        status: str = body.get("status", "")
        logger.debug("LRO status: %s", status or "(direct payload)")

        if status == "Succeeded":
            resource_url: str = (
                body.get("resourceLocation")
                or f"{op_url.rstrip('/')}/result"
            )
            try:
                r2 = requests.get(resource_url, headers=headers, timeout=30)
                if r2.status_code == 200:
                    return r2.json()  # type: ignore[no-any-return]
            except requests.RequestException as exc:
                logger.debug("LRO result fetch failed: %s", exc)
            return body  # embedded result fallback

        if status == "":
            return body  # direct payload (no wrapper)

        if status in ("Failed", "Cancelled"):
            logger.warning("LRO %s: %s", status, body.get("error"))
            return None

        retry_after = int(poll.headers.get("Retry-After", poll_interval))

    logger.warning("LRO did not complete within %ds", max_wait_sec)
    return None


def _decode_parts(result: dict[str, Any]) -> dict[str, str]:
    """Decode base64-encoded TMDL parts from the API response."""
    definition: dict[str, Any] = result.get("definition", result)
    parts: list[dict[str, Any]] = definition.get("parts", [])
    if not parts:
        parts = result.get("parts", [])

    files: dict[str, str] = {}
    for part in parts:
        path: str = part.get("path", "")
        payload: str | bytes = part.get("payload", "")
        if not path or not payload:
            continue
        try:
            raw_bytes = (
                base64.b64decode(payload)
                if isinstance(payload, str)
                else payload
            )
            files[path] = raw_bytes.decode("utf-8", errors="replace")
        except Exception as exc:
            logger.debug("Failed to decode TMDL part '%s': %s", path, exc)

    return files


# ── Parse functions (one per artifact type) ───────────────────────────────────

def parse_model_metadata(tmdl_files: dict[str, str]) -> dict[str, Any]:
    """
    Extract model-level metadata from model.tmdl (and optionally database.tmdl).

    Returns:
        model_name, compatibility_level (int), default_mode (str).
    """
    model_name: str = ""
    compat_level: int = 1560        # modern Fabric default
    default_mode: str = "Import"

    for candidate in ("definition/model.tmdl",):
        content = tmdl_files.get(candidate, "")
        if not content:
            # case-insensitive fallback
            for p in tmdl_files:
                if p.lower().endswith("/model.tmdl"):
                    content = tmdl_files[p]
                    break
        if content:
            nm = re.search(r"^model\s+'?([^'\n]+?)'?\s*$", content, re.MULTILINE)
            if nm:
                model_name = nm.group(1).strip()

            cl = re.search(r"compatibilityLevel:\s*(\d+)", content)
            if cl:
                compat_level = int(cl.group(1))

            dm = re.search(r"defaultPowerBIDataSourceVersion:\s*(\S+)", content)
            if dm:
                ver = dm.group(1).lower()
                if "directlake" in ver:
                    default_mode = "DirectLake"
            break

    # TMSL-style database.tmdl (present in some Fabric exports)
    db_content = tmdl_files.get("definition/database.tmdl", "")
    if db_content:
        nm2 = re.search(r"^database\s+'?([^'\n]+?)'?\s*$", db_content, re.MULTILINE)
        if nm2 and not model_name:
            model_name = nm2.group(1).strip()
        cl2 = re.search(r"compatibilityLevel:\s*(\d+)", db_content)
        if cl2:
            compat_level = int(cl2.group(1))

    return {
        "model_name":          model_name,
        "compatibility_level": compat_level,
        "default_mode":        default_mode,
    }


def parse_relationships(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """Parse all relationships from definition/relationships.tmdl."""
    rel_content = tmdl_files.get("definition/relationships.tmdl", "")
    if not rel_content:
        return []

    relationships: list[dict[str, Any]] = []
    for block in re.split(r"\nrelationship\s+\S+", rel_content)[1:]:
        ft  = re.search(r"fromTable:\s*'?([^'\n]+?)'?\s*$",  block, re.MULTILINE)
        fc  = re.search(r"fromColumn:\s*'?([^'\n]+?)'?\s*$", block, re.MULTILINE)
        tt  = re.search(r"toTable:\s*'?([^'\n]+?)'?\s*$",    block, re.MULTILINE)
        tc  = re.search(r"toColumn:\s*'?([^'\n]+?)'?\s*$",   block, re.MULTILINE)
        xf  = re.search(r"crossFilteringBehavior:\s*(\w+)",   block)
        fc_ = re.search(r"fromCardinality:\s*(\w+)",          block)
        tc_ = re.search(r"toCardinality:\s*(\w+)",            block)
        active = not bool(re.search(r"isActive:\s*false", block, re.IGNORECASE))

        if not (ft and tt):
            continue

        relationships.append({
            "from_table":   ft.group(1).strip(),
            "from_column":  fc.group(1).strip() if fc else "",
            "to_table":     tt.group(1).strip(),
            "to_column":    tc.group(1).strip() if tc else "",
            "cross_filter": xf.group(1) if xf else "oneDirection",
            "cardinality":  f"{fc_.group(1) if fc_ else 'many'}:{tc_.group(1) if tc_ else 'one'}",
            "is_active":    active,
        })

    return relationships


def parse_tables(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """Parse table-level metadata from definition/tables/*.tmdl."""
    tables: list[dict[str, Any]] = []
    for path, content in tmdl_files.items():
        if not path.startswith("definition/tables/"):
            continue
        tbl_name = _extract_table_name(path, content)
        sm = re.search(r"^\s{4}storageMode:\s*(\w+)", content, re.MULTILINE)
        storage_mode = _STORAGE_MODE_MAP.get(
            (sm.group(1) if sm else "import").lower(), "Import"
        )
        is_hidden = bool(re.search(r"^\s{4}isHidden\b", content, re.MULTILINE))
        is_calc   = bool(re.search(r"^\s+mode:\s*calculated\b", content, re.MULTILINE))
        col_count = len(re.findall(r"^\s{4}column\s+", content, re.MULTILINE))
        tables.append({
            "name":          tbl_name,
            "storage_mode":  storage_mode,
            "is_hidden":     is_hidden,
            "is_calculated": is_calc,
            "column_count":  col_count,
        })
    return tables


def parse_raw_measures(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """
    Extract all measures from table TMDL files as raw dicts.

    Fields captured per measure:
        name, table, dax_expression, description, display_folder,
        format_string, is_hidden.
    """
    all_measures: list[dict[str, Any]] = []
    for path, content in tmdl_files.items():
        if not path.startswith("definition/tables/"):
            continue
        tbl_name = _extract_table_name(path, content)
        all_measures.extend(_parse_measures_from_table(content, tbl_name))
    return all_measures


def parse_calculated_columns(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """Extract calculated columns from table TMDL files."""
    result: list[dict[str, Any]] = []
    for path, content in tmdl_files.items():
        if not path.startswith("definition/tables/"):
            continue
        tbl_name = _extract_table_name(path, content)
        result.extend(_parse_calc_columns_from_table(content, tbl_name))
    return result


def parse_calculated_tables(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """
    Detect tables whose partition source is a DAX expression
    (i.e. mode: calculated in the partition block).
    """
    calc_tables: list[dict[str, Any]] = []
    for path, content in tmdl_files.items():
        if not path.startswith("definition/tables/"):
            continue
        if not re.search(r"^\s+mode:\s*calculated\b", content, re.MULTILINE):
            continue
        tbl_name = _extract_table_name(path, content)
        ce = re.search(
            r"mode:\s*calculated.*?\n\s+source\s*\n((?:\s{12,}[^\n]+\n?)+)",
            content, re.DOTALL,
        )
        dax_expr = ""
        if ce:
            dax_expr = "\n".join(
                ln.strip() for ln in ce.group(1).splitlines() if ln.strip()
            )
        calc_tables.append({"name": tbl_name, "dax_expression": dax_expr})
    return calc_tables


def parse_hierarchies(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """Extract hierarchy definitions from table TMDL files."""
    hierarchies: list[dict[str, Any]] = []
    for path, content in tmdl_files.items():
        if not path.startswith("definition/tables/"):
            continue
        tbl_name = _extract_table_name(path, content)
        for m in re.finditer(
            r"^\s{4}hierarchy\s+'?([^'\n]+?)'?\s*$", content, re.MULTILINE
        ):
            hierarchies.append({"table": tbl_name, "name": m.group(1).strip()})
    return hierarchies


def parse_perspectives(tmdl_files: dict[str, str]) -> list[dict[str, Any]]:
    """Extract perspective definitions from definition/perspectives/*.tmdl."""
    perspectives: list[dict[str, Any]] = []
    for path, content in tmdl_files.items():
        if "perspectives" not in path:
            continue
        nm = re.search(
            r"^perspective\s+'?([^'\n]+?)'?\s*$",
            content.strip(),
            re.MULTILINE,
        )
        if nm:
            perspectives.append({"name": nm.group(1).strip()})
    return perspectives


# ── Internal line-by-line TMDL parsers ───────────────────────────────────────

def _extract_table_name(path: str, content: str) -> str:
    """Derive table name from first header line, falling back to filename."""
    first_line = (content.strip().splitlines() or [""])[0].strip()
    th = re.match(r"table\s+'?(.+?)'?\s*$", first_line)
    if th:
        return th.group(1).strip()
    return path.replace("definition/tables/", "").replace(".tmdl", "")


def _parse_measures_from_table(
    content: str, tbl_name: str
) -> list[dict[str, Any]]:
    """
    Line-by-line TMDL parser for measure blocks within a table file.

    TMDL indentation conventions:
      indent 4  → table-level declarations (measure, column, partition)
      indent 8  → property lines (displayFolder, formatString, isHidden …)
      indent 12 → DAX expression body (multi-line measures)
    """
    measures: list[dict[str, Any]] = []
    lines = content.splitlines()
    n = len(lines)
    i = 0

    while i < n:
        raw = lines[i]
        s   = raw.strip()
        ind = len(raw) - len(raw.lstrip()) if s else 0

        if ind == 4 and s.startswith("measure "):
            m = re.match(r"measure\s+'?(.+?)'?\s*=\s*(.*)", s)
            if not m:
                i += 1
                continue

            name        = m.group(1).strip()
            inline_expr = m.group(2).strip()
            display_folder = ""
            description    = ""
            format_string  = ""
            is_hidden      = False
            expr_parts: list[str] = []
            i += 1

            if inline_expr:
                # Single-line DAX — properties follow at indent 8
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
                    ns_l = ns.lower()
                    if ns_l.startswith("displayfolder:"):
                        display_folder = ns.split(":", 1)[1].strip().strip("'\"")
                    elif ns_l.startswith("formatstring:"):
                        format_string = ns.split(":", 1)[1].strip().strip("'\"")
                    elif ns_l.startswith("description:"):
                        description = ns.split(":", 1)[1].strip().strip("'\"")
                    elif ns_l.startswith("ishidden"):
                        is_hidden = True
                    i += 1
            else:
                # Multi-line DAX — body at indent ≥12, properties at indent 8
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
                        in_expr = False
                        ns_l = ns.lower()
                        if ns_l.startswith("displayfolder:"):
                            display_folder = ns.split(":", 1)[1].strip().strip("'\"")
                        elif ns_l.startswith("formatstring:"):
                            format_string = ns.split(":", 1)[1].strip().strip("'\"")
                        elif ns_l.startswith("description:"):
                            description = ns.split(":", 1)[1].strip().strip("'\"")
                        elif ns_l.startswith("ishidden"):
                            is_hidden = True
                    i += 1

            measures.append({
                "name":           name,
                "table":          tbl_name,
                "dax_expression": "\n".join(expr_parts),
                "description":    description or None,
                "display_folder": display_folder or None,
                "format_string":  format_string or None,
                "is_hidden":      is_hidden,
            })
            continue

        i += 1

    return measures


def _parse_calc_columns_from_table(
    content: str, tbl_name: str
) -> list[dict[str, Any]]:
    """
    Extract columns that have columnType: calculated or an expression= property.
    """
    calc_cols: list[dict[str, Any]] = []
    lines = content.splitlines()
    n = len(lines)
    i = 0

    while i < n:
        raw = lines[i]
        s   = raw.strip()
        ind = len(raw) - len(raw.lstrip()) if s else 0

        if ind == 4 and s.startswith("column "):
            cm = re.match(r"column\s+'?(.+?)'?\s*$", s)
            if not cm:
                i += 1
                continue

            col_name  = cm.group(1).strip()
            is_calc   = False
            is_hidden = False
            col_expr  = ""
            data_type = ""
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
                elif re.match(r"^expression\s*=\s*.+", ns, re.IGNORECASE):
                    em = re.match(r"^expression\s*=\s*(.*)", ns, re.IGNORECASE)
                    col_expr = em.group(1).strip() if em else ""
                    is_calc = True
                elif ns_l.startswith("datatype:"):
                    data_type = ns.split(":", 1)[1].strip()
                elif ns_l.startswith("ishidden"):
                    is_hidden = True
                i += 1

            if is_calc and col_name:
                calc_cols.append({
                    "name":           col_name,
                    "table":          tbl_name,
                    "dax_expression": col_expr,
                    "data_type":      data_type,
                    "is_hidden":      is_hidden,
                })
            continue

        i += 1

    return calc_cols
