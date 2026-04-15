"""
FastAPI application factory.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.routes.assessment import router as assessment_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.gateway import router as gateway_router
from app.api.v1.routes.sessions import router as sessions_router
from app.config import settings
from app.core.logging import get_logger
from app.db import azure_store
from app.db import service_bus

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

    # Start Service Bus result listener if configured
    if service_bus.is_available():
        from app.services import result_handler
        service_bus.start_result_listener(result_handler.handle_result)
        logger.info("Service Bus result listener started")
    else:
        logger.info("Service Bus not configured — gateway jobs will use direct HTTP polling")

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

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(assessment_router, prefix="/api/v1", tags=["Assessment"])
app.include_router(gateway_router, prefix="/api/v1/gateway", tags=["Gateway"])
app.include_router(sessions_router, prefix="/api/v1", tags=["Sessions"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# ── Serve React SPA (combined image only) ────────────────────────────────────
# Static assets (JS/CSS/fonts) are served directly.
# A catch-all GET route returns index.html for ALL other paths so that
# React Router can handle client-side navigation on refresh or direct URL access.
# This must come AFTER all API routers so API routes take priority.
_static_dir = Path(os.environ.get("STATIC_DIR", str(settings.static_dir)))
if _static_dir.is_dir():
    # Serve /assets/* directly (JS, CSS, images)
    _assets_dir = _static_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    # Catch-all: serve index.html for any path React Router should own
    _index_file = _static_dir / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if _index_file.is_file():
            return FileResponse(str(_index_file))
        return {"detail": "Not found"}

    logger.info("Serving React SPA from %s", _static_dir)
