"""Shared utilities: logging and per-task timing."""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Generator

from app.core.logging import get_logger


def get_fa_logger(name: str) -> logging.Logger:
    """Return a logger namespaced to the fabric_assessment package."""
    return get_logger(name)


@contextmanager
def timed_task(logger: logging.Logger, label: str) -> Generator[None, None, None]:
    """Context manager that logs start/end times at DEBUG level."""
    t0 = time.monotonic()
    logger.debug("START %s", label)
    try:
        yield
    finally:
        logger.debug("END %s (%.3fs)", label, time.monotonic() - t0)
