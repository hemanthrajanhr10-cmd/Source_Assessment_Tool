"""
Measure Dependency Analyzer.

Builds a directed dependency graph over all measures in a Semantic Model,
then classifies each measure by complexity tier using iterative DFS — no
recursion, so arbitrarily deep chains are handled without stack overflow.

Complexity tiers
----------------
SIMPLE        depth 0  — no measure-to-measure references
MODERATE      depth 1  — references exactly one level of other measures
COMPLEX       depth 2  — two-hop chain (A → B → leaf)
HIGHLY_COMPLEX depth 3+ — three or more hops
CIRCULAR             — participates in a cyclic dependency; depth set to -1

DAX measure reference detection
--------------------------------
A bracketed token [Name] is treated as a measure reference if and only if:
  • Name appears in the known-measure set, AND
  • The token is NOT qualified by a table identifier (e.g. Table[Col] is a
    column reference, not a measure reference).

Pattern used: match [Name] tokens where the character before '[' is NOT a
word character, closing bracket, single-quote, or backtick.
"""

from __future__ import annotations

import re
from typing import Any

from app.fabric_assessment.models import ComplexityTier, MeasureInfo
from app.fabric_assessment.utils import get_fa_logger

logger = get_fa_logger(__name__)

# Matches [Name] that is NOT preceded by a table identifier.
# Negative lookbehind excludes: word chars, ], ', `
_UNQUALIFIED_RE = re.compile(r"(?<!['\w\]`])\[([^\]]+)\]")

# Matches TableName[...] or 'Table Name'[...] — always a column reference.
_QUALIFIED_RE = re.compile(
    r"(?:'[^']*'|[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ\s]*)\[[^\]]+\]"
)

_UNVISITED = 0
_IN_STACK  = 1
_DONE      = 2


def analyze_measures(raw_measures: list[dict[str, Any]]) -> list[MeasureInfo]:
    """
    Classify all measures by complexity and resolve dependency chains.

    Args:
        raw_measures: List of raw measure dicts produced by tmdl_reader.
                      Required keys: name, table, dax_expression.
                      Optional keys: description, display_folder, format_string,
                                     is_hidden.

    Returns:
        List of MeasureInfo with complexity tier, depth, and chain populated.
    """
    if not raw_measures:
        return []

    known: frozenset[str] = frozenset(m["name"] for m in raw_measures)

    # Build adjacency list: measure_name → [referenced measure names]
    adj: dict[str, list[str]] = {
        m["name"]: _parse_measure_refs(m.get("dax_expression", ""), known)
        for m in raw_measures
    }

    depths, chains, circular = _compute_depths(adj, known)

    # Log a summary
    results: list[MeasureInfo] = []
    for m in raw_measures:
        name = m["name"]
        tier, dep_depth, dep_chain = _classify(name, depths, chains, circular)
        results.append(
            MeasureInfo(
                name=name,
                table=m.get("table", ""),
                dax_expression=m.get("dax_expression", ""),
                description=m.get("description"),
                display_folder=m.get("display_folder"),
                format_string=m.get("format_string"),
                is_hidden=bool(m.get("is_hidden", False)),
                complexity=tier,
                dependency_depth=dep_depth,
                dependency_chain=dep_chain,
            )
        )

    _log_summary(results)
    return results


# ── Classification helper ─────────────────────────────────────────────────────

def _classify(
    name: str,
    depths: dict[str, int],
    chains: dict[str, list[str]],
    circular: set[str],
) -> tuple[ComplexityTier, int, list[str]]:
    if name in circular:
        return "CIRCULAR", -1, chains.get(name, [name])

    depth = depths.get(name, 0)
    chain = chains.get(name, [name])

    tier: ComplexityTier
    if depth == 0:
        tier = "SIMPLE"
    elif depth == 1:
        tier = "MODERATE"
    elif depth == 2:
        tier = "COMPLEX"
    else:
        tier = "HIGHLY_COMPLEX"

    return tier, depth, chain


# ── DAX reference parser ──────────────────────────────────────────────────────

def _parse_measure_refs(expr: str, known: frozenset[str]) -> list[str]:
    """
    Return ordered, deduplicated list of measure names referenced in expr.

    Only unqualified [Name] tokens whose Name is in `known` are considered
    measure references.  Table-qualified tokens (Table[Col]) are skipped.
    """
    if not expr:
        return []

    # Compute byte ranges covered by qualified refs (column refs) so we can
    # exclude any unqualified match that falls inside one of those spans.
    qualified_spans: set[int] = set()
    for qm in _QUALIFIED_RE.finditer(expr):
        qualified_spans.update(range(qm.start(), qm.end()))

    refs: list[str] = []
    seen: set[str] = set()
    for um in _UNQUALIFIED_RE.finditer(expr):
        if um.start() in qualified_spans:
            continue
        ref = um.group(1).strip()
        if ref in known and ref not in seen:
            seen.add(ref)
            refs.append(ref)

    return refs


# ── Iterative DFS for depth + cycle detection ─────────────────────────────────

def _compute_depths(
    adj: dict[str, list[str]],
    all_names: frozenset[str],
) -> tuple[dict[str, int], dict[str, list[str]], set[str]]:
    """
    Iterative post-order DFS that computes:
        depths   — measure_name → longest chain length (hop count)
        chains   — measure_name → [this_measure, …, root_measure]
        circular — names that participate in a cycle

    Algorithm
    ---------
    Each stack frame is (measure_name, next_dep_index).  When all
    dependencies of a node have been processed, we pop it and compute its
    depth as 1 + max(depth of its non-circular deps).  Cycles are detected
    via an "in-path" set that tracks the current DFS path.

    Complexity: O(V + E) time, O(V) extra space.
    """
    state:    dict[str, int]       = {n: _UNVISITED for n in all_names}
    depths:   dict[str, int]       = {}
    chains:   dict[str, list[str]] = {}
    circular: set[str]             = set()

    for start in all_names:
        if state[start] != _UNVISITED:
            continue

        # Stack frames: (measure_name, dep_index_to_process_next)
        dfs_stack: list[tuple[str, int]] = [(start, 0)]
        in_path:   set[str]              = {start}
        state[start] = _IN_STACK

        while dfs_stack:
            name, dep_idx = dfs_stack[-1]
            deps = adj.get(name, [])
            pushed_child = False

            # Advance through deps until we find one that needs visiting
            while dep_idx < len(deps):
                dep = deps[dep_idx]
                dep_idx += 1

                if dep in in_path:
                    # Back-edge → cycle
                    circular.add(dep)
                    circular.add(name)
                    continue

                if state[dep] == _DONE or dep in circular:
                    # Already resolved — will be used in depth calc after pop
                    continue

                # dep is UNVISITED: descend
                dfs_stack[-1] = (name, dep_idx)   # save advanced index
                state[dep] = _IN_STACK
                in_path.add(dep)
                dfs_stack.append((dep, 0))
                pushed_child = True
                break

            if not pushed_child:
                # All deps processed — compute this node's depth and pop
                dfs_stack.pop()
                in_path.discard(name)
                state[name] = _DONE

                if name not in circular:
                    valid_deps = [
                        d for d in adj.get(name, [])
                        if d in depths and d not in circular
                    ]
                    if not valid_deps:
                        depths[name] = 0
                        chains[name] = [name]
                    else:
                        deepest = max(valid_deps, key=lambda d: depths[d])
                        depths[name] = 1 + depths[deepest]
                        chains[name] = [name] + chains.get(deepest, [deepest])

    return depths, chains, circular


# ── Logging helper ────────────────────────────────────────────────────────────

def _log_summary(results: list[MeasureInfo]) -> None:
    counts: dict[str, int] = {}
    for r in results:
        counts[r.complexity] = counts.get(r.complexity, 0) + 1
    logger.debug(
        "Measure complexity summary — total=%d  SIMPLE=%d  MODERATE=%d  "
        "COMPLEX=%d  HIGHLY_COMPLEX=%d  CIRCULAR=%d",
        len(results),
        counts.get("SIMPLE", 0),
        counts.get("MODERATE", 0),
        counts.get("COMPLEX", 0),
        counts.get("HIGHLY_COMPLEX", 0),
        counts.get("CIRCULAR", 0),
    )
