"""
In-memory progress tracker for Fabric assessment sessions.

One ProgressState per session_id lives in _STORE for the lifetime of the
assessment plus a short grace period.  All mutations acquire asyncio.Lock
to be safe under concurrent coroutines running on the same event loop.

Usage from the orchestrator:
    tracker = await fabric_progress.create(session_id, label)
    await tracker.set_status("running")
    await tracker.set_totals(n_models, n_reports)
    await tracker.item_completed("Model: Sales", "model")
    ...
    snapshot = tracker.snapshot()   # dict safe to JSON-serialise

Usage from an API endpoint:
    tracker = fabric_progress.get(session_id)
    if tracker:
        return tracker.snapshot()
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

# ── In-process store ──────────────────────────────────────────────────────────
# Maps session_id → ProgressState.  Entries are removed after completion so
# memory usage stays bounded (each entry is O(N) where N ≤ 50 log lines).

_STORE: dict[str, "ProgressState"] = {}
_STORE_LOCK = asyncio.Lock()


class ProgressState:
    """Mutable, lock-guarded progress state for one Fabric assessment session."""

    def __init__(self, assessment_id: str, workspace_label: str = "") -> None:
        self.assessment_id = assessment_id
        self.workspace_label = workspace_label
        # asyncio.Lock: only one coroutine mutates state at a time
        self._lock = asyncio.Lock()

        self.status: str = "queued"
        self.phase: str = "discovery"
        self.total_items: int = 0
        self.processed_items: int = 0
        self.failed_items: int = 0
        self.current_item_name: str = ""
        self.failure_reason: str | None = None
        self.started_at: str = datetime.now(timezone.utc).isoformat()
        self.estimated_completion: str | None = None
        self.errors: list[dict[str, str]] = []
        # Rolling buffer — cap at 50 to bound memory
        self.activity_log: list[dict[str, Any]] = []

        self.phase_progress: dict[str, Any] = {
            "discovery":       {"done": False, "count": 0},
            "semantic_models": {"done": False, "total": 0, "processed": 0},
            "reports":         {"done": False, "total": 0, "processed": 0},
            "dataflows":       {"done": False, "total": 0, "processed": 0},
            "crosslinking":    {"done": False},
            "saving":          {"done": False},
        }

    # ── Mutators (all coroutine-safe) ─────────────────────────────────────────

    async def set_status(self, status: str, failure_reason: str | None = None) -> None:
        async with self._lock:
            self.status = status
            if failure_reason:
                self.failure_reason = failure_reason

    async def set_phase(self, phase: str) -> None:
        async with self._lock:
            self.phase = phase

    async def set_totals(self, total_models: int, total_reports: int, total_dataflows: int = 0) -> None:
        """Called after discovery; sets item counts and marks discovery done."""
        async with self._lock:
            self.total_items = total_models + total_reports + total_dataflows
            self.phase_progress["semantic_models"]["total"] = total_models
            self.phase_progress["reports"]["total"] = total_reports
            self.phase_progress["dataflows"]["total"] = total_dataflows
            self.phase_progress["discovery"]["count"] = self.total_items
            self.phase_progress["discovery"]["done"] = True

    async def item_started(self, name: str) -> None:
        """Update the 'currently processing' label. Non-blocking."""
        async with self._lock:
            self.current_item_name = name

    async def item_completed(self, name: str, item_type: str = "") -> None:
        """
        Atomically increment processed_items and update ETA.
        item_type: "model" | "report" | "dataflow" | ""
        """
        async with self._lock:
            self.processed_items += 1
            if item_type == "model":
                self.phase_progress["semantic_models"]["processed"] += 1
            elif item_type == "report":
                self.phase_progress["reports"]["processed"] += 1
            elif item_type == "dataflow":
                self.phase_progress["dataflows"]["processed"] += 1

            self._recompute_eta()

            ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
            self.activity_log.append(
                {"ts": ts, "status": "ok", "name": name, "type": item_type}
            )
            if len(self.activity_log) > 50:
                self.activity_log.pop(0)

    async def item_failed(self, name: str, error: str, item_type: str = "") -> None:
        """Non-fatal failure: log, continue."""
        async with self._lock:
            self.processed_items += 1
            self.failed_items += 1
            if item_type == "model":
                self.phase_progress["semantic_models"]["processed"] += 1
            elif item_type == "report":
                self.phase_progress["reports"]["processed"] += 1
            elif item_type == "dataflow":
                self.phase_progress["dataflows"]["processed"] += 1

            self.errors.append({"item": name, "error": error[:400]})

            ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
            self.activity_log.append(
                {"ts": ts, "status": "error", "name": name, "type": item_type, "error": error[:200]}
            )
            if len(self.activity_log) > 50:
                self.activity_log.pop(0)

    async def phase_done(self, phase: str) -> None:
        async with self._lock:
            if phase in self.phase_progress:
                self.phase_progress[phase]["done"] = True

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _recompute_eta(self) -> None:
        """Must be called under self._lock."""
        if self.processed_items <= 0 or self.total_items <= 0:
            return
        try:
            started = datetime.fromisoformat(self.started_at)
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            rate = elapsed / self.processed_items
            remaining = max(0, self.total_items - self.processed_items)
            eta_dt = datetime.now(timezone.utc) + timedelta(seconds=remaining * rate)
            self.estimated_completion = eta_dt.isoformat()
        except Exception:
            pass

    # ── Snapshot (read-only, no lock needed — Python GIL + single event loop) ─

    def snapshot(self) -> dict[str, Any]:
        """
        Return a JSON-serialisable dict of current state.
        Reads are safe without a lock because the asyncio event loop is
        single-threaded and attribute reads are atomic at the CPython level.
        """
        return {
            "assessment_id": self.assessment_id,
            "status": self.status,
            "phase": self.phase,
            "total_items": self.total_items,
            "processed_items": self.processed_items,
            "failed_items": self.failed_items,
            "current_item_name": self.current_item_name,
            "failure_reason": self.failure_reason,
            "phase_progress": self.phase_progress,
            "started_at": self.started_at,
            "estimated_completion": self.estimated_completion,
            # Keep error list short to avoid large SSE payloads
            "errors": self.errors[-20:],
            "activity_log": self.activity_log[-50:],
        }


# ── Public helpers ────────────────────────────────────────────────────────────

async def create(session_id: str, label: str = "") -> ProgressState:
    """Create and register a new ProgressState for `session_id`."""
    state = ProgressState(session_id, label)
    async with _STORE_LOCK:
        _STORE[session_id] = state
    return state


def get(session_id: str) -> ProgressState | None:
    """Retrieve a running ProgressState; returns None if not found."""
    return _STORE.get(session_id)


async def remove(session_id: str) -> None:
    """Remove a finished session from the store to free memory."""
    async with _STORE_LOCK:
        _STORE.pop(session_id, None)
