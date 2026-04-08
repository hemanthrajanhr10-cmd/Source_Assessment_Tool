"""
FastAPI application factory.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.routes.assessment import router as assessment_router
from app.config import settings
from app.core.logging import get_logger
from app.db import azure_store

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Reports directory: %s", settings.reports_dir.resolve())

    # Initialise Azure SQL schema — non-fatal: API still starts if DB is
    # temporarily unreachable (firewall propagation, cold start, etc.)
    logger.info("Initialising Azure SQL schema…")
    try:
        azure_store.init_schema()
        logger.info("Azure SQL schema ready")
    except Exception as exc:
        logger.warning(
            "Azure SQL schema init failed — API will start but persistence "
            "is unavailable until the DB is reachable. Error: %s", exc
        )

    logger.info("SQL Server Assessment API started")
    yield
    # Shutdown
    logger.info("SQL Server Assessment API stopped")


app = FastAPI(
    title="SQL Server Source Assessment API",
    description=(
        "Connects to a SQL Server database, collects comprehensive metadata, "
        "and returns structured JSON results plus a downloadable Excel report."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(assessment_router, prefix="/api/v1", tags=["Assessment"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# ── Serve React SPA (combined image only) ────────────────────────────────────
# Mounted LAST so all API routes above take priority.
# html=True makes StaticFiles return index.html for unknown paths (SPA routing).
_static_dir = Path(os.environ.get("STATIC_DIR", str(settings.static_dir)))
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="spa")
    logger.info("Serving React SPA from %s", _static_dir)
