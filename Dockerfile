# ─────────────────────────────────────────────────────────────────────────────
# Backend — SQL Server Source Assessment API
# Python 3.11 · FastAPI · mssql-python · ODBC Driver 18
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS base

# ── System packages + Microsoft ODBC Driver 18 ────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg2 \
        apt-transport-https \
        gcc \
        g++ \
        unixodbc-dev \
    && curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor \
        -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] \
        https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends \
        msodbcsql18 \
    && apt-get purge -y --auto-remove gcc g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ────────────────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# ── Application code ───────────────────────────────────────────────────────────
COPY app/ app/

# ── Reports directory (mounted as volume in production) ────────────────────────
RUN mkdir -p reports

# ── Non-root user for security ─────────────────────────────────────────────────
RUN groupadd -r appuser && useradd -r -g appuser appuser \
 && chown -R appuser:appuser /app
USER appuser

# ── Runtime ────────────────────────────────────────────────────────────────────
EXPOSE 8000

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LOG_LEVEL=INFO

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
