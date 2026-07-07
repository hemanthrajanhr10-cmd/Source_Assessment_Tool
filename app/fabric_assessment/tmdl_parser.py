"""
TMDL (Tabular Model Definition Language) parser for Microsoft Fabric.

Each Fabric semantic model definition is returned as a list of base64-encoded
parts.  This module decodes those parts and parses the TMDL text into
structured dicts that match the FabricDataset TypeScript interface.

TMDL indentation convention (Fabric default):
  0 tabs → database / model / table declaration
  1 tab  → table-level objects (column, measure, partition) + table properties
  2 tabs → column / measure / partition properties
  3+ tabs → multi-line DAX expression body inside a measure
"""

import base64
import re
from typing import Any

from app.fabric_assessment.scoring import score_dax, extract_column_deps


# ── Helpers ───────────────────────────────────────────────────────────────────

def _unquote(name: str) -> str:
    name = name.strip()
    if len(name) >= 2 and name[0] == "'" and name[-1] == "'":
        return name[1:-1]
    return name


def _split_table_column(ref: str) -> tuple[str, str]:
    """
    Split a TMDL table.column reference into (table, column).
    Handles formats: "TableName.'Column Name'", "TableName.ColumnName", "'Column Name'"
    Returns ("", col) when there is no table prefix.
    """
    ref = ref.strip()
    # Pattern: anything before the first dot, then the rest as column
    dot = ref.find(".")
    if dot > 0:
        table = ref[:dot].strip().strip("'")
        col = _unquote(ref[dot + 1:].strip())
        return table, col
    return "", _unquote(ref)


def _indent(line: str) -> int:
    """Count logical indent level (1 tab or 4 spaces = 1 level)."""
    count = 0
    i = 0
    while i < len(line):
        if line[i] == "\t":
            count += 1
            i += 1
        elif line[i] == " ":
            # consume up to 4 spaces as one level
            end = min(i + 4, len(line))
            while i < end and line[i] == " ":
                i += 1
            count += 1
        else:
            break
    return count


_KNOWN_MEASURE_PROPS = frozenset(
    ["formatstring", "displayfolder", "lineagetag", "description",
     "ishidden", "kpi", "annotations", "changedproperties", "changedproperty"]
)

_KNOWN_COLUMN_PROPS = frozenset(
    ["datatype", "formatstring", "lineagetag", "description", "ishidden",
     "summarizeby", "sourcecolumn", "sortbycolumn", "dataCategory",
     "annotations", "changedproperties", "iskey", "isnameinferred",
     "ishiddeninsidegroup"]
)

_DTYPE_MAP = {
    "int64": "int64", "int32": "int64", "int16": "int64", "int8": "int64",
    "integer": "int64",
    "double": "double", "single": "double",
    "decimal": "decimal", "currency": "decimal",
    "boolean": "boolean",
    "datetime": "datetime", "date": "datetime", "time": "datetime",
    "binary": "binary",
    "string": "string", "text": "string",
}

_STORAGE_MAP = {
    "directlake": "DirectLake", "direct_lake": "DirectLake",
    "directquery": "DirectQuery", "direct_query": "DirectQuery",
    "composite": "Composite",
    "dual": "Dual",
    "import": "Import",
}


def _normalise_dtype(s: str) -> str:
    return _DTYPE_MAP.get(s.strip().lower(), s.strip() or "string")


def _normalise_storage(s: str) -> str:
    return _STORAGE_MAP.get(s.strip().lower().replace(" ", ""), "Import")


# ── Public entry point ────────────────────────────────────────────────────────

def decode_parts(raw_parts: list[dict]) -> list[dict]:
    """Base64-decode payload → content string for each part."""
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


def parse_tmdl_parts(parts: list[dict]) -> dict[str, Any]:
    """
    Parse decoded TMDL parts (path + content) into a dict:
      {tables: [...], relationships: [...], storage_mode: str}
    """
    tables: list[dict] = []
    relationships: list[dict] = []
    model_storage = "Import"

    for part in parts:
        path = part.get("path", "")
        content = part.get("content", "")
        if not content:
            continue

        if "tables/" in path and path.endswith(".tmdl"):
            tbl = _parse_table(content)
            if tbl.get("name"):
                tables.append(tbl)

        elif path.endswith("relationships.tmdl"):
            relationships = _parse_relationships(content)

        elif path.endswith("model.tmdl") or path.endswith("database.tmdl"):
            sm = _extract_model_storage(content)
            if sm:
                model_storage = sm

    return {"tables": tables, "relationships": relationships, "storage_mode": model_storage}


# ── Table parser ──────────────────────────────────────────────────────────────

def _parse_table(content: str) -> dict[str, Any]:
    lines = content.splitlines()
    table: dict[str, Any] = {
        "name": None,
        "storage_mode": "Import",
        "is_hidden": False,
        "is_calculated": False,
        "dax_expression": None,
        "columns": [],
        "measures": [],
    }

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            i += 1
            continue

        ind = _indent(line)

        if ind == 0:
            if stripped.startswith("table "):
                rest = stripped[6:].strip()
                if " = " in rest:
                    name_part, expr = rest.split(" = ", 1)
                    table["name"] = _unquote(name_part)
                    table["is_calculated"] = True
                    table["dax_expression"] = expr.strip()
                else:
                    table["name"] = _unquote(rest)

        elif ind == 1:
            if stripped == "isHidden":
                table["is_hidden"] = True

            elif stripped.startswith("storageMode:"):
                table["storage_mode"] = _normalise_storage(stripped.split(":", 1)[1])

            elif stripped.startswith("column "):
                col, i = _parse_column(lines, i)
                if col:
                    table["columns"].append(col)
                continue

            elif stripped.startswith("measure "):
                meas, i = _parse_measure(lines, i)
                if meas:
                    table["measures"].append(meas)
                continue

            elif stripped.startswith("partition "):
                mode, storage, expr = _parse_partition(lines, i)
                if mode == "calculated":
                    table["is_calculated"] = True
                    if expr:
                        table["dax_expression"] = expr
                if storage:
                    table["storage_mode"] = _normalise_storage(storage)
                i = _skip_deeper(lines, i, ind)
                continue

        i += 1

    return table


def _parse_column(lines: list[str], start: int) -> tuple[dict, int]:
    line = lines[start]
    stripped = line.strip()
    ind = _indent(line)

    col: dict[str, Any] = {
        "name": None,
        "data_type": "string",
        "is_hidden": False,
        "is_calculated": False,
        "expression": None,
        "complexity": None,
        "format_string": None,
        "sort_by_column": None,
    }

    rest = stripped[7:].strip()  # after "column "
    if " = " in rest:
        name_part, expr = rest.split(" = ", 1)
        col["name"] = _unquote(name_part)
        col["is_calculated"] = True
        col["expression"] = expr.strip()
    else:
        col["name"] = _unquote(rest)

    i = start + 1
    n = len(lines)
    while i < n:
        sub = lines[i]
        sub_s = sub.strip()
        if not sub_s or sub_s.startswith("//"):
            i += 1
            continue
        sub_ind = _indent(sub)
        if sub_ind <= ind:
            break
        if sub_ind == ind + 1:
            key = sub_s.split(":")[0].lower()
            if key == "datatype" or sub_s.lower().startswith("datatype"):
                col["data_type"] = _normalise_dtype(sub_s.split(":", 1)[1].strip())
            elif key == "formatstring":
                col["format_string"] = sub_s.split(":", 1)[1].strip()
            elif key == "sortbycolumn":
                col["sort_by_column"] = sub_s.split(":", 1)[1].strip()
            elif sub_s == "isHidden":
                col["is_hidden"] = True
            elif sub_s.lower().startswith("expression") and ":" in sub_s:
                expr_val = sub_s.split(":", 1)[1].strip()
                col["expression"] = expr_val.strip("`")
                col["is_calculated"] = True
        i += 1

    if col["is_calculated"] and col["expression"]:
        col["complexity"] = score_dax(col["expression"])

    return col, i


def _parse_measure(lines: list[str], start: int) -> tuple[dict, int]:
    line = lines[start]
    stripped = line.strip()
    ind = _indent(line)

    meas: dict[str, Any] = {
        "name": None,
        "expression": "",
        "format_string": None,
        "display_folder": "",
        "is_hidden": False,
        "complexity": None,
        "dependencies": [],
    }

    rest = stripped[8:].strip()  # after "measure "
    inline_expr = ""
    if " = " in rest:
        name_part, inline_expr = rest.split(" = ", 1)
        meas["name"] = _unquote(name_part)
        inline_expr = inline_expr.strip()
    elif rest.endswith("="):
        meas["name"] = _unquote(rest[:-1].strip())
    else:
        meas["name"] = _unquote(rest)

    expr_lines: list[str] = []
    if inline_expr:
        expr_lines.append(inline_expr)

    prop_ind = ind + 1   # properties live one level deeper than declaration
    expr_ind = ind + 2   # multi-line expression body lives two levels deeper

    i = start + 1
    n = len(lines)
    while i < n:
        sub = lines[i]
        sub_s = sub.strip()
        if not sub_s or sub_s.startswith("//"):
            i += 1
            continue
        sub_ind = _indent(sub)
        if sub_ind <= ind:
            break

        if sub_ind >= expr_ind:
            # Multi-line expression continuation
            expr_lines.append(sub_s)
        elif sub_ind == prop_ind:
            # Key may use ":" (formatString: value) or "=" (changedProperty = Name)
            key = sub_s.split(":")[0].split("=")[0].strip().lower()
            if key in _KNOWN_MEASURE_PROPS:
                if key == "ishidden" or sub_s == "isHidden":
                    meas["is_hidden"] = True
                elif key == "formatstring":
                    meas["format_string"] = sub_s.split(":", 1)[1].strip()
                elif key == "displayfolder":
                    meas["display_folder"] = sub_s.split(":", 1)[1].strip()
                # other known properties we silently skip
            else:
                # Not a known property → treat as expression at prop_ind level
                # (non-standard but seen in some Fabric outputs)
                expr_lines.append(sub_s)
        i += 1

    full_expr = "\n".join(expr_lines).strip()
    meas["expression"] = full_expr
    if full_expr:
        meas["complexity"] = score_dax(full_expr)
        meas["dependencies"] = extract_column_deps(full_expr)

    return meas, i


def _parse_partition(lines: list[str], start: int) -> tuple[str, str, str]:
    """Return (mode, storage_mode, source_expression) from a partition block."""
    ind = _indent(lines[start])
    mode = ""
    storage = ""
    src_lines: list[str] = []
    in_source = False

    i = start + 1
    n = len(lines)
    while i < n:
        sub = lines[i]
        sub_s = sub.strip()
        if not sub_s:
            i += 1
            continue
        sub_ind = _indent(sub)
        if sub_ind <= ind:
            break

        if sub_ind == ind + 1:
            if sub_s.lower().startswith("mode:"):
                mode = sub_s.split(":", 1)[1].strip().lower()
            elif sub_s.lower().startswith("storagemode:"):
                storage = sub_s.split(":", 1)[1].strip()
            elif sub_s == "source":
                in_source = True
            elif sub_s.lower().startswith("source = "):
                src_lines = [sub_s.split(" = ", 1)[1].strip()]
                in_source = True
        elif in_source and sub_ind > ind + 1:
            src_lines.append(sub_s)

        i += 1

    return mode, storage, "\n".join(src_lines) if src_lines else ""


def _skip_deeper(lines: list[str], start: int, base_ind: int) -> int:
    """Advance past all lines with indent > base_ind."""
    i = start + 1
    n = len(lines)
    while i < n:
        s = lines[i].strip()
        if s and _indent(lines[i]) <= base_ind:
            return i
        i += 1
    return i


# ── Relationships parser ──────────────────────────────────────────────────────

def _parse_relationships(content: str) -> list[dict[str, Any]]:
    lines = content.splitlines()
    rels: list[dict] = []
    cur: dict | None = None

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        ind = _indent(line)

        if ind == 0 and stripped.startswith("relationship "):
            if cur:
                rels.append(_finalise_rel(cur))
            cur = {
                "from_table": "", "from_column": "",
                "to_table": "", "to_column": "",
                "cross_filter": "Single",
                "is_active": True,
                "_fc": "many", "_tc": "one",
            }

        elif cur is not None and ind == 1:
            key, _, val = stripped.partition(":")
            key = key.strip().lower()
            val = val.strip()
            if key == "fromtable":
                cur["from_table"] = val
            elif key == "fromcolumn":
                # Value may be "TableName.'ColumnName'" or just "ColumnName"
                tbl, col = _split_table_column(val)
                if tbl:
                    cur["from_table"] = tbl
                cur["from_column"] = col
            elif key == "totable":
                cur["to_table"] = val
            elif key == "tocolumn":
                tbl, col = _split_table_column(val)
                if tbl:
                    cur["to_table"] = tbl
                cur["to_column"] = col
            elif key == "fromcardinality":
                cur["_fc"] = val.lower()
            elif key == "tocardinality":
                cur["_tc"] = val.lower()
            elif key == "crossfilteringbehavior":
                cur["cross_filter"] = "Both" if "both" in val.lower() else "Single"
            elif key == "isactive":
                cur["is_active"] = val.lower() not in ("false", "0", "no")
            elif stripped == "isActive":
                cur["is_active"] = True

    if cur:
        rels.append(_finalise_rel(cur))
    return rels


def _finalise_rel(rel: dict) -> dict:
    card_map = {"one": "1", "many": "M", "none": "0"}
    fc = rel.pop("_fc", "many")
    tc = rel.pop("_tc", "one")
    rel["cardinality"] = f"{card_map.get(fc, 'M')}:{card_map.get(tc, '1')}"
    return rel


# ── Model-level storage mode ──────────────────────────────────────────────────

def _extract_model_storage(content: str) -> str:
    for line in content.splitlines():
        s = line.strip().lower()
        if s.startswith("defaultmode:") or s.startswith("storagemode:"):
            return _normalise_storage(s.split(":", 1)[1])
    return ""


# ── Assembler: raw parse → FabricDataset-shaped dict ─────────────────────────

_SOURCE_FEED_DESCRIPTIONS: dict[str, dict[str, str]] = {
    "Import": {
        "source_type": "Snapshot Cache",
        "feed_description": "Data is imported and cached in-memory. Requires scheduled refresh to stay current.",
        "latency": "Batch / scheduled",
        "recommended": "DirectLake",
        "recommendation_reason": "If your data resides in OneLake (Lakehouse/Warehouse), switch to DirectLake to eliminate refresh cycles and reduce latency.",
    },
    "DirectQuery": {
        "source_type": "Live RDBMS / Warehouse",
        "feed_description": "Every query passes through to the live source in real time. No data is cached.",
        "latency": "Real-time (query-bound)",
        "recommended": "DirectLake",
        "recommendation_reason": "If the source is a Fabric Lakehouse or Warehouse, DirectLake is strongly preferred — it delivers near-real-time performance without per-query source round-trips.",
    },
    "DirectLake": {
        "source_type": "OneLake (Delta Parquet)",
        "feed_description": "Reads Delta Parquet files from OneLake directly. No import or refresh needed.",
        "latency": "Near real-time",
        "recommended": "DirectLake",
        "recommendation_reason": "Already optimal for Fabric-native data. No change recommended.",
    },
    "Dual": {
        "source_type": "Hybrid (Import cache + DirectQuery fallback)",
        "feed_description": "Acts as Import when queried alongside other Import tables; falls back to DirectQuery when queried with DirectQuery tables.",
        "latency": "Mixed (depends on query context)",
        "recommended": "DirectLake",
        "recommendation_reason": "Dual mode adds unpredictable query behaviour. If the source is OneLake, migrate to DirectLake for consistent performance.",
    },
    "Composite": {
        "source_type": "Mixed sources (Import + DirectQuery/DirectLake)",
        "feed_description": "Tables in this model use different storage modes. Import tables are cached; DirectQuery/DirectLake tables hit their source live.",
        "latency": "Mixed — depends on per-table mode",
        "recommended": "DirectLake",
        "recommendation_reason": "Evaluate each table individually. Migrate Import/DirectQuery tables to DirectLake where the source is in OneLake to achieve a uniform, refresh-free model.",
    },
}


def _describe_table_source(
    table_name: str,
    storage_mode: str,
    is_calculated: bool,
    dax_expression: str | None,
) -> dict[str, str]:
    """Return a source-feed descriptor dict for a single table."""
    if is_calculated:
        return {
            "source_type": "DAX Calculated Table",
            "feed_description": "Derived entirely from DAX. No external source — data comes from other tables in this model.",
            "latency": "In-memory (computed at refresh/query)",
            "recommended": "N/A — DAX table",
            "recommendation_reason": "Calculated tables cannot have their storage mode changed. Consider whether the calculation could be pushed upstream to the lakehouse.",
        }
    desc = _SOURCE_FEED_DESCRIPTIONS.get(storage_mode, {})
    if not desc:
        return {
            "source_type": storage_mode or "Unknown",
            "feed_description": "Storage mode not recognized.",
            "latency": "Unknown",
            "recommended": "Review manually",
            "recommendation_reason": "Unrecognized storage mode — review the TMDL definition for this table.",
        }
    return dict(desc)


def _infer_model_storage_mode(tables: list[dict], declared_mode: str) -> str:
    """
    Infer the effective model-level storage mode from per-table modes.

    Rules (matching Power BI/Fabric semantics):
      - All tables Import            → Import
      - All tables DirectLake        → DirectLake
      - All tables DirectQuery       → DirectQuery
      - Mix of DirectLake + Import   → Composite
      - Mix of DirectQuery + Import  → Composite
      - Mix of DL + DQ               → Composite
      - Any Dual table present       → Composite (Dual tables exist only in Composite models)
      - No tables (empty model)      → use declared_mode as-is
      - Declared mode is already set (non-empty, non-Import default)
        AND all actual tables agree  → trust declared_mode
    """
    # Calculated tables are purely DAX-generated; exclude from storage inference
    physical_modes = {
        t.get("storage_mode", "Import")
        for t in tables
        if not t.get("is_calculated", False)
    }
    # Remove empty/None entries
    physical_modes.discard("")
    physical_modes.discard(None)

    if not physical_modes:
        return declared_mode or "Import"

    if "Dual" in physical_modes:
        return "Composite"

    unique = physical_modes - {"Dual"}
    if len(unique) == 1:
        return unique.pop()

    # More than one distinct mode → Composite
    return "Composite"


def assemble_dataset(
    dataset_id: str,
    dataset_name: str,
    configured_by: str,
    is_refreshable: bool,
    web_url: str,
    tmdl_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert parsed TMDL data into a FabricDataset-shaped dict.
    """
    tables_raw: list[dict] = tmdl_data.get("tables", [])
    relationships: list[dict] = tmdl_data.get("relationships", [])
    declared_storage: str = tmdl_data.get("storage_mode", "Import")
    storage_mode: str = _infer_model_storage_mode(tables_raw, declared_storage)

    # ── Build flat lists ──────────────────────────────────────────────────────
    tables_out: list[dict] = []
    measures_out: list[dict] = []
    calc_cols_out: list[dict] = []
    calc_tables_out: list[dict] = []

    for t in tables_raw:
        tname = t.get("name", "")

        # Calculated table
        if t.get("is_calculated"):
            expr = t.get("dax_expression") or ""
            calc_tables_out.append({
                "name": tname,
                "expression": expr,
                "complexity": score_dax(expr) if expr else None,
            })

        # Columns for this table
        tbl_cols: list[dict] = []
        for c in t.get("columns", []):
            tbl_cols.append({
                "name": c.get("name", ""),
                "data_type": c.get("data_type", "string"),
                "is_calculated": c.get("is_calculated", False),
                "is_hidden": c.get("is_hidden", False),
                "expression": c.get("expression"),
                "complexity": c.get("complexity"),
            })
            if c.get("is_calculated") and c.get("expression"):
                calc_cols_out.append({
                    "name": c.get("name", ""),
                    "table": tname,
                    "expression": c.get("expression", ""),
                    "data_type": c.get("data_type"),
                    "complexity": c.get("complexity"),
                })

        # Measures for this table → flat list
        for m in t.get("measures", []):
            measures_out.append({
                "name": m.get("name", ""),
                "table": tname,
                "expression": m.get("expression", ""),
                "display_folder": m.get("display_folder", ""),
                "format_string": m.get("format_string"),
                "complexity": m.get("complexity"),
                "dependencies": m.get("dependencies", []),
            })

        effective_table_mode = t.get("storage_mode", storage_mode)
        tables_out.append({
            "name": tname,
            "storage_mode": effective_table_mode,
            "is_hidden": t.get("is_hidden", False),
            "is_calculated": t.get("is_calculated", False),
            "columns": tbl_cols,
            "source_feeds": _describe_table_source(
                tname, effective_table_mode, t.get("is_calculated", False),
                t.get("dax_expression"),
            ),
        })

    # ── Compute model-level complexity score (0–100) ──────────────────────────
    complexity_score = _compute_model_complexity(
        tables_raw, measures_out, calc_cols_out, calc_tables_out, relationships
    )

    # ── Model-level storage recommendation ────────────────────────────────────
    storage_recommendation = _build_model_storage_recommendation(tables_out, storage_mode)

    return {
        "id": dataset_id,
        "name": dataset_name,
        "configured_by": configured_by,
        "is_refreshable": is_refreshable,
        "storage_mode": storage_mode,
        "storage_recommendation": storage_recommendation,
        "web_url": web_url,
        "table_count": len(tables_out),
        "measure_count": len(measures_out),
        "calculated_column_count": len(calc_cols_out),
        "calculated_table_count": len(calc_tables_out),
        "relationship_count": len(relationships),
        "complexity_score": complexity_score,
        "info_supported": True,
        "tables": tables_out,
        "measures": measures_out,
        "calculated_columns": calc_cols_out,
        "calculated_tables": calc_tables_out,
        "relationships": relationships,
    }


def _build_model_storage_recommendation(tables: list[dict], model_storage: str) -> dict:
    """
    Build a model-level storage recommendation object.

    Analyses per-table storage modes and returns:
      - overall_recommended: the single best storage mode for the whole model
      - tables_to_migrate: list of table names that should change their mode
      - summary: human-readable summary of the recommendation
      - risk_level: Low | Medium | High based on current mode mix
    """
    mode_counts: dict[str, int] = {}
    tables_to_migrate: list[dict] = []

    for t in tables:
        mode = t.get("storage_mode", "Import")
        mode_counts[mode] = mode_counts.get(mode, 0) + 1
        feeds = t.get("source_feeds", {})
        recommended = feeds.get("recommended", "")
        if recommended not in ("N/A — DAX table", model_storage, "") and mode != recommended:
            tables_to_migrate.append({
                "table": t.get("name", ""),
                "current_mode": mode,
                "recommended_mode": recommended,
                "reason": feeds.get("recommendation_reason", ""),
            })

    # Determine risk
    if model_storage == "DirectLake":
        risk = "Low"
        overall_recommended = "DirectLake"
        summary = "Model is already using DirectLake — the optimal Fabric-native storage mode."
    elif model_storage == "Import":
        risk = "Medium"
        overall_recommended = "DirectLake"
        summary = "All tables use Import mode. If data resides in OneLake, migrating to DirectLake will eliminate refresh windows and reduce data latency."
    elif model_storage == "DirectQuery":
        risk = "High"
        overall_recommended = "DirectLake"
        summary = "All tables use DirectQuery. Every report interaction round-trips to the source. If the source is a Fabric Lakehouse or Warehouse, DirectLake offers the same freshness at dramatically better performance."
    elif model_storage == "Composite":
        non_dl_count = sum(v for k, v in mode_counts.items() if k not in ("DirectLake", "Dual"))
        physical_count = sum(v for k, v in mode_counts.items() if k != "N/A")
        if non_dl_count == 0:
            risk = "Low"
            overall_recommended = "DirectLake"
            summary = "Composite model with only DirectLake/Dual tables — already well-optimised."
        elif non_dl_count < physical_count / 2:
            risk = "Medium"
            overall_recommended = "DirectLake"
            summary = f"Composite model: {non_dl_count} table(s) still use Import/DirectQuery. Migrate them to DirectLake to reduce refresh dependency and query latency."
        else:
            risk = "High"
            overall_recommended = "DirectLake"
            summary = f"Composite model with {non_dl_count} Import/DirectQuery table(s). Significant migration opportunity to convert to a pure DirectLake model."
    elif model_storage == "Dual":
        risk = "Medium"
        overall_recommended = "DirectLake"
        summary = "Model has Dual-mode tables. Dual behaviour is unpredictable across query contexts. Migrate to DirectLake for consistent real-time performance."
    else:
        risk = "Medium"
        overall_recommended = "DirectLake"
        summary = f"Current storage mode '{model_storage}' is non-standard. Review manually and consider DirectLake if data is in OneLake."

    return {
        "current_mode": model_storage,
        "overall_recommended": overall_recommended,
        "risk_level": risk,
        "summary": summary,
        "mode_breakdown": mode_counts,
        "tables_to_migrate": tables_to_migrate,
    }


def _compute_model_complexity(
    tables: list[dict],
    measures: list[dict],
    calc_cols: list[dict],
    calc_tables: list[dict],
    relationships: list[dict],
) -> int:
    """
    Scoring rubric (0–100):
      Calculated tables  → +2 each, capped at 20
      Calculated columns → +1 each, capped at 15
      Measures count     → +0.5 each, capped at 15
      DAX depth          → avg nesting depth of measures, scaled 0–20
      Relationships      → M:M +3, bidirectional +2, inactive +1 — capped at 15
      Hidden objects     → proportion of hidden cols/measures, max 5
      Dependency chain   → max deps per measure, scaled 0–10
    """
    score = 0.0

    # Calculated tables
    score += min(len(calc_tables) * 2, 20)

    # Calculated columns
    score += min(len(calc_cols), 15)

    # Measures count
    score += min(len(measures) * 0.5, 15)

    # DAX depth (avg nesting depth of all measures)
    if measures:
        depths = [m["complexity"]["nesting_depth"] for m in measures if m.get("complexity")]
        if depths:
            avg_depth = sum(depths) / len(depths)
            score += min(avg_depth * 4, 20)

    # Relationships complexity
    rel_score = 0
    for rel in relationships:
        card = rel.get("cardinality", "M:1")
        if card in ("M:M", "M:0"):
            rel_score += 3
        if rel.get("cross_filter") == "Both":
            rel_score += 2
        if not rel.get("is_active", True):
            rel_score += 1
    score += min(rel_score, 15)

    # Hidden objects
    all_cols = [c for t in tables for c in t.get("columns", [])]
    all_objs = all_cols + [{"is_hidden": m.get("is_hidden", False)} for m in measures]
    if all_objs:
        hidden_ratio = sum(1 for o in all_objs if o.get("is_hidden")) / len(all_objs)
        score += hidden_ratio * 5

    # Dependency chain (max column deps for any single measure)
    if measures:
        max_deps = max((len(m.get("dependencies", [])) for m in measures), default=0)
        score += min(max_deps / 2, 10)

    return min(round(score), 100)
