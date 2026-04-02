"""
FastAPI application factory.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes.assessment import router as assessment_router
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Reports directory: %s", settings.reports_dir.resolve())
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
