"""
Report JSON parser for Microsoft Fabric / Power BI report definitions.

A report definition (returned via Fabric API LRO) consists of several parts.
The main layout is in a part with path ending in 'report.json'.
Each 'section' in report.json is a page; each page has 'visualContainers'
whose 'config' sub-field (a JSON string) describes the visual type and bindings.
"""

import base64
import json
import re
from typing import Any


# ── Aggregation function codes ────────────────────────────────────────────────
_AGG_FUNCTIONS = {0: "Count", 1: "Sum", 2: "Min", 3: "Max", 4: "Average", 5: "CountRows"}


# ── Public entry point ────────────────────────────────────────────────────────

def decode_parts(raw_parts: list[dict]) -> list[dict]:
    """Base64-decode payload field for each part."""
    decoded = []
    for part in raw_parts:
        path = part.get("path", "")
        payload = part.get("payload", "")
        try:
            if isinstance(payload, bytes):
                content = payload.decode("utf-8")
            else:
                content = base64.b64decode(payload).decode("utf-8")
        except Exception:
            content = payload if isinstance(payload, str) else ""
        decoded.append({"path": path, "content": content})
    return decoded


def parse_report_parts(
    parts: list[dict],
    dataset_measures: dict[str, dict] | None = None,
) -> dict[str, Any]:
    """
    Parse decoded report parts into a FabricReport-shaped dict.

    dataset_measures: optional {measure_name → measure_dict} for enriching
                      measure fields with expression + complexity data.
    """
    report_json_content = ""
    definition_content = ""

    for part in parts:
        path = part.get("path", "")
        content = part.get("content", "")
        if not content:
            continue
        if path.endswith("report.json"):
            report_json_content = content
        elif path.endswith(".pbir") or path.endswith("definition.pbir"):
            definition_content = content

    if not report_json_content:
        return _empty_report()

    try:
        layout = json.loads(report_json_content)
    except json.JSONDecodeError:
        return _empty_report()

    pages = _parse_pages(layout, dataset_measures or {})
    bookmarks = _extract_bookmarks(layout)
    visual_count = sum(p["visual_count"] for p in pages)

    return {
        "page_count": len(pages),
        "visual_count": visual_count,
        "bookmark_count": len(bookmarks),
        "bookmarks": bookmarks,
        "layout_parsed": True,
        "pages": pages,
    }


# ── Pages ─────────────────────────────────────────────────────────────────────

def _parse_pages(layout: dict, measures_map: dict) -> list[dict]:
    sections = layout.get("sections", [])
    pages = []
    for section in sections:
        name = section.get("displayName") or section.get("name", "Page")
        ordinal = section.get("ordinal", 0)
        containers = section.get("visualContainers", [])
        visuals = [v for v in (_parse_visual(vc, measures_map) for vc in containers) if v]
        pages.append({
            "name": name,
            "order": ordinal,
            "visual_count": len(visuals),
            "visuals": visuals,
        })
    # sort by ordinal
    pages.sort(key=lambda p: p["order"])
    return pages


# ── Visuals ───────────────────────────────────────────────────────────────────

def _parse_visual(container: dict, measures_map: dict) -> dict | None:
    config_raw = container.get("config", "{}")
    try:
        config = json.loads(config_raw) if isinstance(config_raw, str) else config_raw
    except Exception:
        return None

    sv = config.get("singleVisual") or config.get("singleVisualGroup")
    if not sv:
        return None

    visual_type = sv.get("visualType", "unknown")
    if visual_type in ("group", "shape", "basicShape"):
        return None  # skip non-data visuals

    title = _extract_title(sv)
    fields = _extract_fields(sv, measures_map)

    return {
        "type": visual_type,
        "title": title,
        "field_count": len(fields),
        "fields": fields,
    }


def _extract_title(sv: dict) -> str:
    try:
        objects = sv.get("objects", {})
        title_objs = objects.get("title", [])
        if title_objs:
            text_expr = title_objs[0]["properties"]["text"]["expr"]
            # Usually Literal.Value = "'Title Text'" (with surrounding quotes)
            literal = text_expr.get("Literal", {}).get("Value", "")
            if literal.startswith("'") and literal.endswith("'"):
                return literal[1:-1]
            return literal
    except Exception:
        pass
    return ""


def _extract_fields(sv: dict, measures_map: dict) -> list[dict]:
    """
    Extract data field bindings from a singleVisual node.
    Handles prototypeQuery.Select → Column, Measure, Aggregation.
    """
    pq = sv.get("prototypeQuery", {})
    if not pq:
        # Fallback: try projections
        return _extract_from_projections(sv, measures_map)

    # Build alias → table name from From[]
    from_map: dict[str, str] = {
        src["Name"]: src.get("Entity", src["Name"])
        for src in pq.get("From", [])
        if "Name" in src
    }

    fields: list[dict] = []
    for sel in pq.get("Select", []):
        field = _parse_select_item(sel, from_map, measures_map)
        if field:
            fields.append(field)

    return fields


def _parse_select_item(
    sel: dict, from_map: dict[str, str], measures_map: dict
) -> dict | None:
    try:
        if "Column" in sel:
            col = sel["Column"]
            table = _resolve_table(col.get("Expression", {}), from_map)
            name = col.get("Property", "")
            return {"field_type": "column", "name": name, "table": table}

        elif "Measure" in sel:
            meas = sel["Measure"]
            table = _resolve_table(meas.get("Expression", {}), from_map)
            name = meas.get("Property", "")
            field: dict[str, Any] = {"field_type": "measure", "name": name, "table": table}
            # Enrich with expression + complexity if available
            m_data = measures_map.get(name)
            if m_data:
                field["expression"] = m_data.get("expression", "")
                field["complexity"] = m_data.get("complexity")
                field["dependencies"] = m_data.get("dependencies", [])
            return field

        elif "Aggregation" in sel:
            agg = sel["Aggregation"]
            fn_code = agg.get("Function", 0)
            fn_name = _AGG_FUNCTIONS.get(fn_code, "Agg")
            inner = agg.get("Expression", {})
            inner_col = inner.get("Column", {})
            table = _resolve_table(inner_col.get("Expression", {}), from_map)
            col_name = inner_col.get("Property", "")
            return {
                "field_type": "aggregation",
                "name": col_name or sel.get("Name", ""),
                "table": table,
                "column": col_name,
                "agg_function": fn_name,
            }

        elif "Hierarchy" in sel:
            hier = sel["Hierarchy"]
            table = _resolve_table(hier.get("Expression", {}), from_map)
            name = hier.get("Property", "")
            return {"field_type": "hierarchy", "name": name, "table": table}

    except Exception:
        pass
    return None


def _resolve_table(expr: dict, from_map: dict[str, str]) -> str:
    """Resolve SourceRef alias to real table name."""
    try:
        src = expr.get("SourceRef", {}).get("Source", "")
        return from_map.get(src, src)
    except Exception:
        return ""


def _extract_from_projections(sv: dict, measures_map: dict) -> list[dict]:
    """Fallback field extraction from singleVisual.projections."""
    fields = []
    projections = sv.get("projections", {})
    query_field_map = {
        qf.get("queryRef", ""): qf
        for role_list in projections.values()
        for qf in (role_list if isinstance(role_list, list) else [])
    }
    for qref, qf in query_field_map.items():
        name = qref.split(".")[-1] if "." in qref else qref
        table = qref.split(".")[0] if "." in qref else ""
        m_data = measures_map.get(name)
        if m_data:
            field: dict[str, Any] = {"field_type": "measure", "name": name, "table": table}
            field["expression"] = m_data.get("expression", "")
            field["complexity"] = m_data.get("complexity")
            field["dependencies"] = m_data.get("dependencies", [])
        else:
            field = {"field_type": "column", "name": name, "table": table}
        fields.append(field)
    return fields


# ── Bookmarks ─────────────────────────────────────────────────────────────────

def _extract_bookmarks(layout: dict) -> list[dict]:
    """Extract bookmarks from top-level report config JSON string."""
    bookmarks = []
    config_raw = layout.get("config", "{}")
    try:
        config = json.loads(config_raw) if isinstance(config_raw, str) else config_raw
    except Exception:
        return []

    bm_list = config.get("bookmarks", [])
    for bm in bm_list:
        bookmarks.append({
            "id": bm.get("name", ""),
            "name": bm.get("displayName", bm.get("name", "")),
            "target_page": bm.get("targetPage", bm.get("defaultPage", "")),
        })
    return bookmarks


# ── Fallback empty report ─────────────────────────────────────────────────────

def _empty_report() -> dict[str, Any]:
    return {
        "page_count": None,
        "visual_count": 0,
        "bookmark_count": 0,
        "bookmarks": [],
        "layout_parsed": False,
        "pages": [],
    }
