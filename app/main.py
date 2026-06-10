"""
FastAPI application factory.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.routes.assessment import router as assessment_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.fabric import router as fabric_router
from app.api.v1.routes.gateway import router as gateway_router
from app.api.v1.routes.hybrid_connections import router as hybrid_connections_router
from app.api.v1.routes.user_connections import router as user_connections_router
from app.api.v1.routes.sessions import router as sessions_router
from app.api.v1.routes.unified_sessions import router as unified_sessions_router
from app.api.v1.routes.sap import router as sap_router
from app.api.v1.routes.sage_intacct import router as sage_intacct_router
from app.api.v1.routes.tableau import router as tableau_router
from app.api.v1.routes.snowflake import router as snowflake_router
from app.api.v1.routes.dataverse import router as dataverse_router
from app.config import settings
from app.core.logging import get_logger
from app.db import azure_store
from app.db import service_bus

logger = get_logger(__name__)


async def _init_schema_background() -> None:
    """
    Run Azure SQL schema initialisation after a short delay so that the server
    is already listening on port 8000 when Azure's health probe fires.
    Retries every 30 s indefinitely — a serverless Azure SQL tier can take
    several minutes to resume after auto-pause.
    """
    await asyncio.sleep(5)   # let uvicorn finish binding before the first attempt
    while True:
        try:
            logger.info("Initialising Azure SQL schema…")
            await asyncio.get_event_loop().run_in_executor(None, azure_store.init_schema)
            logger.info("Azure SQL schema ready")
            return
        except Exception as exc:
            logger.warning(
                "Azure SQL schema init failed — will retry in 30 s. Error: %s", exc
            )
            await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Reports directory: %s", settings.reports_dir.resolve())

    # Run schema init in a background task so the server binds to port 8000
    # immediately and passes the Azure Container Apps health check.
    # Azure SQL serverless tier can take 60–120 s to wake up on first connection;
    # blocking here causes ContainerTimeout (230 s limit) before /health ever responds.
    _schema_task = asyncio.create_task(_init_schema_background())

    # Start Service Bus result listener if configured
    if service_bus.is_available():
        from app.services import result_handler
        service_bus.start_result_listener(result_handler.handle_result)
        logger.info("Service Bus result listener started")
    else:
        logger.info("Service Bus not configured — gateway jobs will use direct HTTP polling")

    # Watchdog: periodically fail jobs that have been Pending too long
    # (covers relay/service-bus jobs whose agent crashed before submitting)
    _watchdog_task = asyncio.create_task(_pending_job_watchdog())

    logger.info("SQL Server Assessment API started")
    yield
    # Shutdown
    _watchdog_task.cancel()
    _schema_task.cancel()
    logger.info("SQL Server Assessment API stopped")


async def _pending_job_watchdog(interval_s: int = 300, timeout_minutes: int = 30) -> None:
    """
    Every `interval_s` seconds, mark any PENDING job older than `timeout_minutes`
    as FAILED.  This prevents gateway jobs from staying Pending forever when the
    agent is offline or crashes before posting results back.
    """
    await asyncio.sleep(interval_s)   # first run after 5 min, not immediately on startup
    while True:
        try:
            count = azure_store.timeout_stale_pending_jobs(older_than_minutes=timeout_minutes)
            if count:
                logger.warning(
                    "Watchdog timed out %d stale PENDING job(s) (threshold: %d min)",
                    count, timeout_minutes,
                )
        except Exception as exc:
            logger.warning("Pending-job watchdog error (non-fatal): %s", exc)
        await asyncio.sleep(interval_s)


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

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(assessment_router, prefix="/api/v1", tags=["Assessment"])
app.include_router(fabric_router, prefix="/api/v1/fabric", tags=["Fabric"])
app.include_router(gateway_router, prefix="/api/v1/gateway", tags=["Gateway"])
app.include_router(hybrid_connections_router, prefix="/api/v1/hybrid-connections", tags=["Hybrid Connections"])
app.include_router(sessions_router, prefix="/api/v1", tags=["Sessions"])
app.include_router(unified_sessions_router, prefix="/api/v1/unified-sessions", tags=["Unified Sessions"])
app.include_router(user_connections_router, prefix="/api/v1/user-connections", tags=["User Connections"])
app.include_router(sap_router, tags=["SAP"])
app.include_router(sage_intacct_router, tags=["Sage Intacct"])
app.include_router(tableau_router, tags=["Tableau"])
app.include_router(snowflake_router, tags=["Snowflake"])
app.include_router(dataverse_router, tags=["Dataverse"])


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
