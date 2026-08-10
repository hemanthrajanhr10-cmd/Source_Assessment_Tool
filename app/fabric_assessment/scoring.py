"""
DAX complexity scoring for measures, calculated columns, and calculated tables.

Scoring heuristic:
  - Tier-1 functions (IF, SWITCH, IFERROR …)      → +1 each
  - Tier-2 functions (CALCULATE, FILTER, ALL …)   → +2 each
  - Tier-3 functions (SUMX, RANKX, EARLIER …)     → +3 each
  - VAR declarations                               → +1 each
  - Nesting depth ≥2/4/6                           → +1/+2/+3

Level thresholds: None=0, Simple=1–3, Moderate=4–7, Complex=8–11, Very Complex≥12
"""

import re
from typing import Any

_TIER1 = {
    "IF", "SWITCH", "IFERROR", "ISINSCOPE", "COALESCE",
    "BLANK", "TRUE", "FALSE", "NOT", "AND", "OR",
}
_TIER2 = {
    "CALCULATE", "CALCULATETABLE", "FILTER", "ALL", "ALLEXCEPT", "ALLSELECTED",
    "KEEPFILTERS", "REMOVEFILTERS", "ALLNOBLANKROW", "ALLCROSSFILTERED",
    "DISTINCT", "VALUES", "SUMMARIZE", "SUMMARIZECOLUMNS", "ADDCOLUMNS",
    "SELECTCOLUMNS", "CROSSJOIN", "NATURALINNERJOIN", "NATURALLEFTOUTERJOIN",
    "RELATED", "RELATEDTABLE", "USERELATIONSHIP", "CROSSFILTER",
    "TREATAS", "LOOKUPVALUE", "CONTAINS", "CONTAINSROW",
}
_TIER3 = {
    "SUMX", "AVERAGEX", "MINX", "MAXX", "COUNTX", "PRODUCTX", "CONCATENATEX",
    "RANKX", "EARLIER", "EARLIEST", "TOPN", "GENERATE", "GENERATEALL",
    "WINDOW", "OFFSET", "INDEX", "ORDERBY", "PARTITIONBY",
    "ADDMISSINGITEMS", "GROUPBY", "SUBSTITUTEWITHINDEX",
}
_LEVEL_THRESHOLDS = (
    (12, "Very Complex"),
    (8,  "Complex"),
    (4,  "Moderate"),
    (1,  "Simple"),
    (0,  "None"),
)


def score_dax(expression: str) -> dict[str, Any]:
    """Score a DAX expression. Returns a dict matching the MeasureComplexity TS interface."""
    if not expression or not expression.strip():
        return {
            "score": 0, "level": "None",
            "function_count": 0, "nesting_depth": 0,
            "dependency_count": 0, "complex_functions": [],
        }

    expr_upper = expression.upper()
    all_fns = re.findall(r"\b([A-Z][A-Z0-9_]*)\s*\(", expr_upper)

    score = 0
    complex_fns: list[str] = []
    for fn in all_fns:
        if fn in _TIER3:
            score += 3
            if fn not in complex_fns:
                complex_fns.append(fn)
        elif fn in _TIER2:
            score += 2
            if fn not in complex_fns:
                complex_fns.append(fn)
        elif fn in _TIER1:
            score += 1

    # VAR declarations add complexity
    score += len(re.findall(r"\bVAR\b", expr_upper))

    # Nesting depth via max parenthesis depth
    depth = max_depth = 0
    for ch in expression:
        if ch == "(":
            depth += 1
            if depth > max_depth:
                max_depth = depth
        elif ch == ")":
            depth = max(0, depth - 1)

    if max_depth >= 6:
        score += 3
    elif max_depth >= 4:
        score += 2
    elif max_depth >= 2:
        score += 1

    # Count unique bracket references (column/measure refs)
    col_refs = re.findall(r"(?<!\w)\[([^\]]+)\]", expression)
    dep_count = len(set(col_refs))

    level = "None"
    for threshold, lv in _LEVEL_THRESHOLDS:
        if score >= threshold:
            level = lv
            break

    return {
        "score": score,
        "level": level,
        "function_count": len(all_fns),
        "nesting_depth": max_depth,
        "dependency_count": dep_count,
        "complex_functions": complex_fns[:5],
    }


def extract_column_deps(expression: str) -> list[dict[str, str]]:
    """
    Extract table-qualified column/measure references from a DAX expression.
    Matches  TableName[Col]  and  'Table Name'[Col].
    Returns list of {table, column} dicts (deduplicated, order-preserving).
    """
    pattern = r"""(?:'([^']+)'|(\b\w[\w ]*?))\[([^\]]+)\]"""
    seen: set[tuple[str, str]] = set()
    deps: list[dict[str, str]] = []
    for m in re.finditer(pattern, expression):
        table = (m.group(1) or m.group(2) or "").strip()
        column = m.group(3).strip()
        if table:
            key = (table, column)
            if key not in seen:
                seen.add(key)
                deps.append({"table": table, "column": column})
    return deps
