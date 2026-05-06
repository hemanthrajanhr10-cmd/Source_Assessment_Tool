"""
Async extraction pipeline for Fabric Semantic Model assessment.

Pipeline overview
-----------------
1. TMDL fetch  — single async I/O call wrapped in run_in_executor
2. Parallel parse — 8 artifact-type parsers run concurrently in a
   ThreadPoolExecutor; each failure is captured as a warning, not a crash
3. Measure analysis — synchronous post-processing on in-memory data

Entry points
------------
  async def extract_semantic_model(workspace_id, dataset_id, token, max_workers=8)
      → SemanticModelAssessment

  def extract_semantic_model_sync(workspace_id, dataset_id, token, max_workers=8)
      → SemanticModelAssessment   (backward-compatible sync shim)
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import time
from datetime import datetime, timezone
from typing import Any

from app.fabric_assessment import measure_analyzer, tmdl_reader
from app.fabric_assessment.models import (
    CalculatedColumnInfo,
    CalculatedTableInfo,
    MeasureInfo,
    SemanticModelAssessment,
)
from app.fabric_assessment.utils import get_fa_logger, timed_task

logger = get_fa_logger(__name__)


async def extract_semantic_model(
    workspace_id: str,
    dataset_id:   str,
    token:        str,
    max_workers:  int = 8,
) -> SemanticModelAssessment:
    """
    Async entry point for full Semantic Model extraction.

    Steps
    -----
    1. Fetch all TMDL parts from the Fabric REST API (LRO pattern).
    2. Parse each artifact type concurrently via ThreadPoolExecutor.
    3. Run Measure Dependency Analyzer on the collected measures.

    Partial failures (e.g. relationships parse error) are captured in
    SemanticModelAssessment.warnings instead of raising.
    """
    t_start = time.monotonic()
    warnings: list[str] = []
    loop = asyncio.get_event_loop()

    # ── Step 1: Fetch TMDL (network I/O) ─────────────────────────────────────
    logger.debug(
        "START tmdl_fetch  workspace=%s  dataset=%s", workspace_id, dataset_id
    )
    tmdl_files: dict[str, str] = await loop.run_in_executor(
        None,
        lambda: tmdl_reader.fetch_tmdl_parts(token, workspace_id, dataset_id),
    )
    logger.debug("END tmdl_fetch: %d parts received", len(tmdl_files))

    if not tmdl_files:
        warnings.append(
            "TMDL fetch returned no parts — model may be inaccessible or "
            "the token lacks Contributor access."
        )

    # ── Step 2: Parse artifacts concurrently ─────────────────────────────────
    task_fns: dict[str, Any] = {
        "metadata":      lambda: tmdl_reader.parse_model_metadata(tmdl_files),
        "tables":        lambda: tmdl_reader.parse_tables(tmdl_files),
        "raw_measures":  lambda: tmdl_reader.parse_raw_measures(tmdl_files),
        "calc_cols":     lambda: tmdl_reader.parse_calculated_columns(tmdl_files),
        "calc_tables":   lambda: tmdl_reader.parse_calculated_tables(tmdl_files),
        "relationships": lambda: tmdl_reader.parse_relationships(tmdl_files),
        "hierarchies":   lambda: tmdl_reader.parse_hierarchies(tmdl_files),
        "perspectives":  lambda: tmdl_reader.parse_perspectives(tmdl_files),
    }

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
    submitted: dict[str, concurrent.futures.Future[Any]] = {
        name: executor.submit(fn) for name, fn in task_fns.items()
    }

    parsed: dict[str, Any] = {}
    for name, fut in submitted.items():
        t0 = time.monotonic()
        try:
            parsed[name] = fut.result()
            logger.debug("Task %-16s completed in %.3fs", name, time.monotonic() - t0)
        except Exception as exc:
            logger.error("Task %s failed: %s", name, exc)
            warnings.append(f"Extraction error [{name}]: {exc}")
            parsed[name] = {} if name == "metadata" else []

    executor.shutdown(wait=False)

    # ── Step 3: Measure dependency analysis ───────────────────────────────────
    raw_measures: list[dict[str, Any]] = parsed.get("raw_measures", [])
    analyzed_measures: list[MeasureInfo] = []
    t0 = time.monotonic()
    try:
        analyzed_measures = measure_analyzer.analyze_measures(raw_measures)
        logger.debug(
            "Measure analysis completed in %.3fs (%d measures)",
            time.monotonic() - t0,
            len(analyzed_measures),
        )
    except Exception as exc:
        logger.error("Measure dependency analysis failed: %s", exc)
        warnings.append(f"Measure analysis error: {exc}")

    # ── Assemble typed result objects ─────────────────────────────────────────
    metadata: dict[str, Any] = parsed.get("metadata", {})

    calc_columns: list[CalculatedColumnInfo] = [
        CalculatedColumnInfo(
            name=cc["name"],
            table=cc["table"],
            dax_expression=cc.get("dax_expression", ""),
            data_type=cc.get("data_type", ""),
            is_hidden=bool(cc.get("is_hidden", False)),
        )
        for cc in parsed.get("calc_cols", [])
    ]

    calc_tables: list[CalculatedTableInfo] = [
        CalculatedTableInfo(
            name=ct["name"],
            dax_expression=ct.get("dax_expression", ""),
        )
        for ct in parsed.get("calc_tables", [])
    ]

    duration = time.monotonic() - t_start
    logger.info(
        "extract_semantic_model done in %.2fs — "
        "tables=%d  measures=%d  calc_cols=%d  calc_tables=%d  relationships=%d",
        duration,
        len(parsed.get("tables", [])),
        len(analyzed_measures),
        len(calc_columns),
        len(calc_tables),
        len(parsed.get("relationships", [])),
    )

    return SemanticModelAssessment(
        workspace_id=workspace_id,
        dataset_id=dataset_id,
        model_name=metadata.get("model_name") or dataset_id,
        compatibility_level=int(metadata.get("compatibility_level", 1560)),
        default_mode=str(metadata.get("default_mode", "Import")),
        tables=parsed.get("tables", []),
        measures=analyzed_measures,
        calculated_tables=calc_tables,
        calculated_columns=calc_columns,
        relationships=parsed.get("relationships", []),
        extraction_duration_seconds=round(duration, 3),
        extracted_at=datetime.now(timezone.utc).isoformat(),
        warnings=warnings,
    )


def extract_semantic_model_sync(
    workspace_id: str,
    dataset_id:   str,
    token:        str,
    max_workers:  int = 8,
) -> SemanticModelAssessment:
    """
    Synchronous shim — runs the async pipeline with asyncio.run().

    Use this when you need to call the extractor from a non-async context
    (e.g. from an existing ThreadPoolExecutor worker or a script).
    """
    return asyncio.run(
        extract_semantic_model(workspace_id, dataset_id, token, max_workers)
    )
