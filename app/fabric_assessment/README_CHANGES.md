# Fabric Assessment — TMDL Extraction Upgrade

## What changed

A new self-contained package `app/fabric_assessment/` replaces the inline TMDL
parsing that lived inside `app/services/fabric_service.py`.  The existing
`fabric_service.py` is **unchanged** — the new package is an additive layer that
can be called alongside or instead of the old helpers.

---

## File structure

```
app/fabric_assessment/
├── __init__.py          re-exports the two public entry points
├── models.py            SemanticModelAssessment + artifact dataclasses
├── utils.py             timed_task() context manager, logger factory
├── tmdl_reader.py       LRO fetch + per-artifact TMDL parsers
├── measure_analyzer.py  dependency graph builder + complexity classifier
└── extractor.py         async pipeline orchestrator
```

---

## How to invoke

```python
from app.fabric_assessment import extract_semantic_model, extract_semantic_model_sync
from app.fabric_assessment.models import SemanticModelAssessment

# --- Async (preferred inside FastAPI route handlers) ---
result: SemanticModelAssessment = await extract_semantic_model(
    workspace_id="f033e9a5-...",
    dataset_id="afdb1c1d-...",
    token=fabric_bearer_token,   # obtain via _get_fabric_token(auth_id)
    max_workers=8,               # thread pool size for parallel parsing
)

# --- Sync shim (use from non-async contexts / scripts) ---
result = extract_semantic_model_sync(workspace_id, dataset_id, token)

print(result.model_name)
print(result.extraction_duration_seconds)
for m in result.measures:
    print(m.name, m.complexity, m.dependency_depth, m.dependency_chain)
```

---

## Async pipeline structure

```
extract_semantic_model()
│
├─ [await] tmdl_reader.fetch_tmdl_parts()     ← single network LRO call
│           202 → poll → /result → decode base64 parts
│
├─ [ThreadPoolExecutor, max_workers=8]
│   ├─ parse_model_metadata()                 ← model.tmdl → name, compat, mode
│   ├─ parse_tables()                         ← tables/*.tmdl → table list
│   ├─ parse_raw_measures()                   ← tables/*.tmdl → raw measure dicts
│   ├─ parse_calculated_columns()             ← tables/*.tmdl → calc column list
│   ├─ parse_calculated_tables()              ← partition mode=calculated
│   ├─ parse_relationships()                  ← relationships.tmdl
│   ├─ parse_hierarchies()                    ← tables/*.tmdl → hierarchy list
│   └─ parse_perspectives()                   ← perspectives/*.tmdl
│
└─ [sync] measure_analyzer.analyze_measures()  ← dependency graph + classify
```

Each parallel task failure is captured in `SemanticModelAssessment.warnings`
— partial results are always returned instead of raising.

---

## Complexity tier definitions

| Tier           | `dependency_depth` | Meaning                                          |
|----------------|--------------------|--------------------------------------------------|
| `SIMPLE`       | 0                  | No measure-to-measure references                |
| `MODERATE`     | 1                  | References exactly one other measure (one hop)  |
| `COMPLEX`      | 2                  | Two-hop chain  (A → B → leaf)                   |
| `HIGHLY_COMPLEX` | ≥ 3              | Three or more hops                              |
| `CIRCULAR`     | -1                 | Participates in a cyclic dependency             |

`dependency_chain` lists measures from the classified measure to the root
dependency, e.g. `["RevenueNet", "RevenueGross", "SalesAmount"]`.

Depth is computed as `1 + max(depth of direct measure dependencies)` using
iterative post-order DFS — no recursion, safe for any chain length.

---

## Measure reference detection

Only **unqualified** bracket tokens `[Name]` are treated as potential measure
references.  Table-qualified tokens `TableName[Column]` or `'Table'[Col]` are
always column references and are excluded.  A match is confirmed only if `Name`
exists in the model's measure name set.

---

## Backward compatibility

`fabric_service.py` is untouched.  If you need the new typed result from an
existing sync flow, use `extract_semantic_model_sync()`.
