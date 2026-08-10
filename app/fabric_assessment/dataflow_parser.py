"""
Dataflow definition parser.

Decodes base64 parts returned by the Fabric GET /dataflows/{id}/getDefinition
LRO endpoint and extracts:
  - Entities (output tables): name, columns, row count hint
  - Power Query M expressions per entity
  - Data source types referenced in the mashup
  - Transformation step counts (complexity proxy)
  - Upstream dataflow references

Gen1 dataflows do not expose a definition endpoint — for those we rely on
the metadata + datasources API responses assembled in the orchestrator.
"""

import base64
import json
import re
from typing import Any


# ── Public entry points ───────────────────────────────────────────────────────

def decode_parts(parts: list[dict]) -> list[dict]:
    """Base64-decode all definition parts → [{path, content}]."""
    decoded: list[dict] = []
    for part in parts:
        payload = part.get("payload", "")
        try:
            content = base64.b64decode(payload + "==").decode("utf-8", errors="replace")
        except Exception:
            content = ""
        decoded.append({"path": part.get("path", ""), "content": content})
    return decoded


def parse_dataflow_parts(decoded_parts: list[dict]) -> dict[str, Any]:
    """
    Parse decoded definition parts into a structured dataflow dict.

    Priority order for entity/M-code discovery:
      1. model.json  — entity list with column schemas
      2. mashup_document / any *.json containing "Table" / "Entity" keys
      3. Fallback: regex scan of raw M content
    """
    model_json: dict = {}
    mashup_text = ""

    for part in decoded_parts:
        path = part.get("path", "").lower()
        content = part.get("content", "")
        if not content:
            continue
        if "model.json" in path:
            try:
                model_json = json.loads(content)
            except Exception:
                pass
        # Collect all text that might contain M code
        mashup_text += "\n" + content

    entities = _parse_entities(model_json, mashup_text)
    sources = _extract_data_sources(mashup_text)
    upstream_refs = _extract_upstream_refs(mashup_text)

    return {
        "entities": entities,
        "entity_count": len(entities),
        "data_sources": sources,
        "datasource_count": len(sources),
        "upstream_dataflow_refs": upstream_refs,
        "total_transformation_steps": sum(e.get("step_count", 0) for e in entities),
        "complexity": _compute_complexity(entities),
    }


def assemble_dataflow(
    *,
    dataflow_id: str,
    dataflow_name: str,
    generation: str,
    workspace_id: str,
    configured_by: str,
    modified_by: str,
    modified_at: str,
    description: str,
    can_refresh: bool,
    refresh_count: int,
    failure_count: int,
    avg_duration_sec: float,
    last_refresh_time: str,
    next_refresh_time: str,
    refresh_schedule: dict,
    gateway_id: str,
    state: str,
    datasources: list[dict],
    transactions: list[dict],
    upstream: list[dict],
    definition_data: dict,
) -> dict[str, Any]:
    """Combine metadata + definition into the final FabricDataflow dict."""
    entities = definition_data.get("entities", [])
    sources_from_def = definition_data.get("data_sources", [])

    # Merge datasources from API + definition (API is authoritative for connection info)
    merged_sources = _merge_datasources(datasources, sources_from_def)

    # Refresh reliability
    total_runs = refresh_count + failure_count
    reliability_pct = round((refresh_count / total_runs) * 100, 1) if total_runs > 0 else None

    # Schedule summary
    schedule_summary = _summarise_schedule(refresh_schedule)

    return {
        "id": dataflow_id,
        "name": dataflow_name,
        "generation": generation,
        "description": description,
        "workspace_id": workspace_id,
        "configured_by": configured_by,
        "modified_by": modified_by,
        "modified_at": modified_at,
        "state": state,
        # Refresh metadata
        "can_refresh": can_refresh,
        "refresh_count": refresh_count,
        "failure_count": failure_count,
        "reliability_pct": reliability_pct,
        "avg_duration_sec": avg_duration_sec,
        "last_refresh_time": last_refresh_time,
        "next_refresh_time": next_refresh_time,
        "refresh_schedule": refresh_schedule,
        "schedule_summary": schedule_summary,
        "gateway_id": gateway_id,
        # Data sources
        "datasources": merged_sources,
        "datasource_count": len(merged_sources),
        # Entities / output tables
        "entities": entities,
        "entity_count": definition_data.get("entity_count", 0),
        # Complexity
        "total_transformation_steps": definition_data.get("total_transformation_steps", 0),
        "complexity": definition_data.get("complexity", _empty_complexity()),
        # Lineage
        "upstream_dataflows": upstream,
        "upstream_dataflow_refs": definition_data.get("upstream_dataflow_refs", []),
        # Refresh history (last 10 transactions)
        "transactions": transactions,
        "has_refresh_errors": any(t.get("status") == "Failed" for t in transactions),
    }


def empty_definition() -> dict[str, Any]:
    """Return a blank definition dict for Gen1 dataflows (no definition endpoint)."""
    return {
        "entities": [],
        "entity_count": 0,
        "data_sources": [],
        "datasource_count": 0,
        "upstream_dataflow_refs": [],
        "total_transformation_steps": 0,
        "complexity": _empty_complexity(),
    }


# ── Entity parsing ────────────────────────────────────────────────────────────

def _parse_entities(model_json: dict, mashup_text: str) -> list[dict[str, Any]]:
    """Extract entity/table definitions from model.json and/or raw M text."""
    entities: list[dict] = []
    seen_names: set[str] = set()

    # Primary: model.json entities array
    for entity in model_json.get("entities", []):
        name = entity.get("name", "")
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        columns = _parse_model_columns(entity.get("attributes", entity.get("columns", [])))
        m_expr = _find_m_expression(name, mashup_text)
        named_steps = _extract_named_steps(m_expr)
        entities.append({
            "name": name,
            "description": entity.get("description", ""),
            "columns": columns,
            "column_count": len(columns),
            "m_expression": m_expr,
            "step_count": _count_steps(m_expr),
            "named_steps": named_steps,
            "complexity": _score_m_complexity(m_expr),
            "is_enabled": entity.get("isEnabled", True),
            "is_hidden": entity.get("isHidden", False),
            "destination_table": _extract_destination_table(m_expr, name),
            "destination_lakehouse": _extract_destination_lakehouse(m_expr),
            "destination_warehouse": _extract_destination_warehouse(m_expr),
            "uses_merge": _detect_merge(m_expr),
            "merge_kinds": _extract_merge_kinds(m_expr),
        })

    # Fallback: scan M text for "let … in" blocks if model.json had nothing
    if not entities:
        for name, m_expr in _extract_let_blocks(mashup_text):
            if name in seen_names:
                continue
            seen_names.add(name)
            named_steps = _extract_named_steps(m_expr)
            entities.append({
                "name": name,
                "description": "",
                "columns": [],
                "column_count": 0,
                "m_expression": m_expr,
                "step_count": _count_steps(m_expr),
                "named_steps": named_steps,
                "complexity": _score_m_complexity(m_expr),
                "is_enabled": True,
                "is_hidden": False,
                "destination_table": _extract_destination_table(m_expr, name),
                "destination_lakehouse": _extract_destination_lakehouse(m_expr),
                "destination_warehouse": _extract_destination_warehouse(m_expr),
                "uses_merge": _detect_merge(m_expr),
                "merge_kinds": _extract_merge_kinds(m_expr),
            })

    return entities


def _parse_model_columns(raw_cols: list[dict]) -> list[dict[str, str]]:
    cols = []
    for c in raw_cols:
        cols.append({
            "name": c.get("name", c.get("Name", "")),
            "data_type": c.get("dataType", c.get("DataType", c.get("type", "String"))),
        })
    return cols


# ── M expression helpers ──────────────────────────────────────────────────────

def _find_m_expression(entity_name: str, text: str) -> str:
    """
    Try to locate the M expression block for a named entity.
    Searches for patterns like:  shared <EntityName> = let ... in ...
    """
    # Lookahead: next shared definition OR end of string (no \n required before \Z)
    pattern = rf'(?:shared\s+)?["\']?{re.escape(entity_name)}["\']?\s*=\s*(let\b.*?)(?=\n\s*shared|\Z)'
    m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def _extract_let_blocks(text: str) -> list[tuple[str, str]]:
    """
    Scan mashup text for patterns:  <Name> = let ... in <Result>
    Returns list of (name, expression) tuples.
    """
    results = []
    pattern = r'(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_ ]*?)\s*=\s*(let\b.*?)\bin\b\s+\S[^\n]*'
    for m in re.finditer(pattern, text, re.DOTALL | re.IGNORECASE):
        name = m.group(1).strip().strip('"\'')
        expr = m.group(0).strip()
        if name and len(expr) > 10:
            results.append((name, expr))
    return results


def _count_steps(m_expr: str) -> int:
    """Count transformation steps = number of named assignments inside the let block."""
    if not m_expr:
        return 0
    return len(re.findall(r'^\s{2,}[A-Za-z_#"][^=\n]*=', m_expr, re.MULTILINE))


def _extract_named_steps(m_expr: str) -> list[str]:
    """Return the ordered list of named step identifiers from a let block."""
    if not m_expr:
        return []
    return re.findall(r'^\s{2,}([A-Za-z_#"][^=\n]*?)\s*=', m_expr, re.MULTILINE)


def _extract_destination_table(m_expr: str, entity_name: str) -> str:
    """
    Infer the output/destination table name from the M expression.
    The final identifier after 'in' is the result — that is the destination table.
    Falls back to the entity name itself.
    """
    if not m_expr:
        return entity_name
    # Pattern: "in\n  <Identifier>" or "in <Identifier>" at end of let block
    # Allow optional trailing semicolon (shared entity definitions end with ;)
    m = re.search(r'\bin\s+([A-Za-z_#][A-Za-z0-9_ #]*)\s*;?\s*$', m_expr, re.MULTILINE)
    if m:
        return m.group(1).strip().strip('"\'')
    return entity_name


# Lakehouse.Contents patterns: Lakehouse.Contents("name") or LakehouseContents with workspace
_LAKEHOUSE_PATTERN = re.compile(
    r'Lakehouse\.Contents\s*\(\s*["\']([^"\']+)["\']',
    re.IGNORECASE,
)

def _extract_destination_lakehouse(m_expr: str) -> str:
    """Extract lakehouse name from Lakehouse.Contents() calls in M code."""
    if not m_expr:
        return ""
    m = _LAKEHOUSE_PATTERN.search(m_expr)
    return m.group(1).strip() if m else ""


# Warehouse patterns: Warehouse.Contents("name") or AzureSynapse patterns
_WAREHOUSE_PATTERN = re.compile(
    r'(?:Warehouse\.Contents|AzureSynapseAnalytics\.Database)\s*\(\s*["\']([^"\']+)["\']',
    re.IGNORECASE,
)

def _extract_destination_warehouse(m_expr: str) -> str:
    """Extract warehouse/Synapse name from M code."""
    if not m_expr:
        return ""
    m = _WAREHOUSE_PATTERN.search(m_expr)
    return m.group(1).strip() if m else ""


# Merge/Join detection — all M functions that combine tables
_MERGE_FUNCTIONS = {
    "Table.Join": "Inner",
    "Table.NestedJoin": "Nested",
    "Table.FuzzyJoin": "Fuzzy",
    "Table.FuzzyGroup": "FuzzyGroup",
    "Table.AddJoinColumn": "Left Outer",
    "Record.Merge": "Record Merge",
    "Record.Combine": "Record Combine",
}

_MERGE_FN_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(k) for k in _MERGE_FUNCTIONS) + r')\s*\(',
    re.IGNORECASE,
)

# JoinKind constants that appear inside join calls
_JOIN_KIND_PATTERN = re.compile(
    r'JoinKind\.(\w+)',
    re.IGNORECASE,
)

def _detect_merge(m_expr: str) -> bool:
    """Return True if the M expression contains any merge/join operation."""
    if not m_expr:
        return False
    return bool(_MERGE_FN_PATTERN.search(m_expr))


def _extract_merge_kinds(m_expr: str) -> list[str]:
    """
    Return the distinct merge/join function names (and explicit JoinKind values)
    used in this M expression.
    """
    if not m_expr:
        return []
    kinds: list[str] = []
    for m in _MERGE_FN_PATTERN.finditer(m_expr):
        fn = m.group(1)
        # Find the nearest JoinKind inside the same call
        snippet = m_expr[m.start():m.start() + 300]
        jk = _JOIN_KIND_PATTERN.search(snippet)
        label = f"{fn}({jk.group(1)})" if jk else fn
        if label not in kinds:
            kinds.append(label)
    return kinds


# ── M Complexity Scoring ──────────────────────────────────────────────────────
# Similar tier system to DAX scoring in scoring.py but tuned for Power Query M.

_M_TIER1 = {
    "Table.SelectRows", "Table.SelectColumns", "Table.RenameColumns",
    "Table.RemoveColumns", "Table.ReorderColumns", "Table.Sort",
    "Table.TransformColumnTypes", "Table.AddColumn", "Table.RemoveRows",
    "Table.Skip", "Table.FirstN", "Table.LastN",
    "Text.Upper", "Text.Lower", "Text.Trim", "Text.Clean",
    "Date.Year", "Date.Month", "Date.Day",
    "Number.Round", "Number.RoundDown", "Number.RoundUp",
    "List.Count", "List.Sum", "List.Average", "List.Min", "List.Max",
    "Record.Field", "Record.ToTable",
    "if", "try", "each",
}

_M_TIER2 = {
    "Table.Join", "Table.NestedJoin", "Table.FuzzyJoin",
    "Table.Group", "Table.Pivot", "Table.Unpivot", "Table.UnpivotOtherColumns",
    "Table.TransformColumns", "Table.CombineColumns", "Table.SplitColumn",
    "Table.Buffer", "Table.Distinct", "Table.DuplicateColumn",
    "Table.ExpandTableColumn", "Table.ExpandRecordColumn", "Table.ExpandListColumn",
    "Table.FromList", "Table.FromRecords", "Table.ToList",
    "Table.AddJoinColumn", "Table.FillDown", "Table.FillUp",
    "List.Generate", "List.Accumulate", "List.Transform", "List.Select",
    "List.TransformMany", "List.Combine",
    "Record.AddField", "Record.RemoveFields", "Record.TransformFields",
    "Function.From", "Function.Invoke",
    "Sql.Database", "Oracle.Database", "Snowflake.Databases",
    "AzureStorage.BlobContents", "AzureStorage.Tables",
    "SharePoint.Files", "SharePoint.Tables",
    "OData.Feed", "Web.Contents", "Json.Document", "Xml.Document", "Csv.Document",
    "Excel.Workbook", "Excel.CurrentWorkbook",
}

_M_TIER3 = {
    "Table.AddFuzzyClusterColumn", "Table.FuzzyGroup",
    "Table.TransformRows", "Table.FromPartitions",
    "Value.ReplaceType", "Value.NativeQuery",
    "Dataflow.Contents",
    "List.Zip", "List.Positions", "List.RemoveMatchingItems",
    "Record.Combine", "Record.Merge",
    "Binary.Decompress", "Binary.Buffer",
    "Expression.Evaluate", "Expression.Identifier",
    "Diagnostics.ActivityId", "Diagnostics.Trace",
}

_COMPLEXITY_THRESHOLDS = (
    (15, "Very Complex"),
    (9,  "Complex"),
    (5,  "Moderate"),
    (1,  "Simple"),
    (0,  "None"),
)


def _score_m_complexity(m_expr: str) -> dict[str, Any]:
    if not m_expr or not m_expr.strip():
        return _empty_complexity()

    text_upper = m_expr.upper()
    # Extract all function-call-like names: Word(
    all_fns = re.findall(r'\b([A-Za-z][A-Za-z0-9._]*)\s*\(', m_expr)

    score = 0
    complex_fns: list[str] = []
    fn_count = len(all_fns)

    for fn in all_fns:
        fn_norm = fn  # preserve casing for set lookup
        if fn_norm in _M_TIER3:
            score += 3
            if fn_norm not in complex_fns:
                complex_fns.append(fn_norm)
        elif fn_norm in _M_TIER2:
            score += 2
            if fn_norm not in complex_fns:
                complex_fns.append(fn_norm)
        elif fn_norm in _M_TIER1:
            score += 1

    # Each step in let block adds 0.5 (rounded)
    steps = _count_steps(m_expr)
    score += steps // 2

    # Nesting depth via max parenthesis depth
    depth = max_depth = 0
    for ch in m_expr:
        if ch == "(":
            depth += 1
            max_depth = max(max_depth, depth)
        elif ch == ")":
            depth = max(0, depth - 1)
    if max_depth >= 6:
        score += 3
    elif max_depth >= 4:
        score += 2
    elif max_depth >= 2:
        score += 1

    level = "None"
    for threshold, lv in _COMPLEXITY_THRESHOLDS:
        if score >= threshold:
            level = lv
            break

    return {
        "score": score,
        "level": level,
        "function_count": fn_count,
        "step_count": steps,
        "nesting_depth": max_depth,
        "complex_functions": complex_fns[:5],
    }


def _empty_complexity() -> dict[str, Any]:
    return {
        "score": 0,
        "level": "None",
        "function_count": 0,
        "step_count": 0,
        "nesting_depth": 0,
        "complex_functions": [],
    }


# ── Data source extraction ────────────────────────────────────────────────────

# Known Power Query M source function prefixes → friendly type names
_SOURCE_PATTERNS: list[tuple[str, str]] = [
    (r'\bSql\.Database\b', "SQL Server"),
    (r'\bAzureSql\.Database\b', "Azure SQL"),
    (r'\bAzureSql\.Databases\b', "Azure SQL"),
    (r'\bSnowflake\.Databases\b', "Snowflake"),
    (r'\bOracle\.Database\b', "Oracle"),
    (r'\bMySql\.Database\b', "MySQL"),
    (r'\bPostgreSQL\.Database\b', "PostgreSQL"),
    (r'\bTeradata\.Database\b', "Teradata"),
    (r'\bSalesforce\.Data\b', "Salesforce"),
    (r'\bSalesforce\.Reports\b', "Salesforce"),
    (r'\bDynamics365\.Accounts\b', "Dynamics 365"),
    (r'\bCommonDataService\.Database\b', "Dataverse"),
    (r'\bAzureStorage\.Blobs\b', "Azure Blob Storage"),
    (r'\bAzureStorage\.Tables\b', "Azure Table Storage"),
    (r'\bAzureStorage\.BlobContents\b', "Azure Blob Storage"),
    (r'\bAdlsGen2\.Contents\b', "Azure Data Lake Gen2"),
    (r'\bAzureDataLakeStorage\.Contents\b', "Azure Data Lake Gen2"),
    (r'\bAzureDatabricks\.Catalogs\b', "Databricks"),
    (r'\bSpark\.Tables\b', "Databricks / Spark"),
    (r'\bSharePoint\.Files\b', "SharePoint"),
    (r'\bSharePoint\.Tables\b', "SharePoint"),
    (r'\bExcel\.Workbook\b', "Excel"),
    (r'\bCsv\.Document\b', "CSV"),
    (r'\bJson\.Document\b', "JSON"),
    (r'\bXml\.Document\b', "XML"),
    (r'\bOData\.Feed\b', "OData"),
    (r'\bWeb\.Contents\b', "Web / REST API"),
    (r'\bDataflow\.Contents\b', "Dataflow (upstream)"),
    (r'\bPowerBI\.Datasets\b', "Power BI Dataset"),
    (r'\bAnalysisServices\.Databases\b', "Analysis Services"),
    (r'\bSapBusinessWarehouse\.Cubes\b', "SAP BW"),
    (r'\bSapHana\.Database\b', "SAP HANA"),
    (r'\bGoogleBigQuery\.Database\b', "Google BigQuery"),
    (r'\bAmazonRedshift\.Database\b', "Amazon Redshift"),
    (r'\bAthena\.Database\b', "Amazon Athena"),
    (r'\bDB2\.Database\b', "IBM Db2"),
    (r'\bSybase\.Database\b', "Sybase"),
]


def _extract_data_sources(text: str) -> list[dict[str, str]]:
    """Identify data source types from M code patterns."""
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for pattern, label in _SOURCE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE) and label not in seen:
            seen.add(label)
            found.append({"type": label})
    return found


def _extract_upstream_refs(text: str) -> list[str]:
    """Find references to other dataflows via Dataflow.Contents() calls."""
    refs: list[str] = []
    for m in re.finditer(r'Dataflow\.Contents\s*\([^)]*["\']([^"\']+)["\']', text, re.IGNORECASE):
        name = m.group(1).strip()
        if name and name not in refs:
            refs.append(name)
    return refs


# ── Datasource merge ──────────────────────────────────────────────────────────

def _merge_datasources(api_sources: list[dict], def_sources: list[dict]) -> list[dict]:
    """
    Merge API-level datasource info (rich: server, database, credential type)
    with definition-level source types (extracted from M code).
    API sources are preferred; definition sources fill gaps.
    """
    result = list(api_sources)  # API sources are authoritative
    existing_types = {s.get("datasource_type", "").lower() for s in result}

    for ds in def_sources:
        ds_type = ds.get("type", "")
        if ds_type.lower() not in existing_types:
            result.append({
                "datasource_type": ds_type,
                "server": "",
                "database": "",
                "gateway_id": "",
                "credential_type": "",
            })
            existing_types.add(ds_type.lower())

    return result


# ── Refresh schedule summary ──────────────────────────────────────────────────

def _summarise_schedule(schedule: dict) -> str:
    if not schedule or not schedule.get("enabled"):
        return "Not scheduled"
    days = schedule.get("days", [])
    times = schedule.get("times", [])
    if not days and not times:
        return "Scheduled (no details)"
    day_str = ", ".join(days) if days else "Daily"
    time_str = ", ".join(times) if times else ""
    if time_str:
        return f"{day_str} at {time_str}"
    return day_str


# ── Overall complexity ────────────────────────────────────────────────────────

def _compute_complexity(entities: list[dict]) -> dict[str, Any]:
    """Aggregate complexity across all entities for a model-level score."""
    if not entities:
        return _empty_complexity()
    scores = [e.get("complexity", {}).get("score", 0) for e in entities]
    total = sum(scores)
    avg = total / len(scores) if scores else 0
    level = "None"
    for threshold, lv in _COMPLEXITY_THRESHOLDS:
        if avg >= threshold:
            level = lv
            break
    complex_fns: list[str] = []
    for e in entities:
        for fn in e.get("complexity", {}).get("complex_functions", []):
            if fn not in complex_fns:
                complex_fns.append(fn)
    return {
        "score": round(avg, 1),
        "level": level,
        "function_count": sum(e.get("complexity", {}).get("function_count", 0) for e in entities),
        "step_count": sum(e.get("step_count", 0) for e in entities),
        "nesting_depth": max((e.get("complexity", {}).get("nesting_depth", 0) for e in entities), default=0),
        "complex_functions": complex_fns[:10],
    }
