# ─────────────────────────────────────────────────────────────────────────────
# SQL Server Source Assessment Tool — Combined Image
#
# Stage 1  node-builder    Build the React/Vite frontend → dist/
# Stage 2  py-deps         Install Python deps (separate layer for caching)
# Stage 3  runtime         Slim Python image + ODBC 18 + frontend assets
#
# Result: a single image that serves both the API (/api/v1) and the React SPA (/)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-slim AS node-builder

WORKDIR /ui

# Install deps (cached unless package files change)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
# VITE_API_URL='' forces relative URLs so the build works on any host (Azure, local, etc.)
COPY frontend/ .
RUN VITE_API_URL='' npm run build
# Output: /ui/dist/


# ── Stage 2: Install Python dependencies ─────────────────────────────────────
FROM python:3.11-slim AS py-deps

WORKDIR /deps

# Build tools needed by packages that compile C extensions:
#   libpq-dev  → psycopg2 (required by cloud-sql-python-connector[psycopg2])
#   libxml2-dev / libpam0g-dev → ibm_db native extension
#   gcc / g++ / python3-dev → any C/C++ extension compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ python3-dev \
    libpq-dev \
    libxml2-dev \
    libpam0g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt


# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# ── Microsoft ODBC Driver 18 (required by mssql-python) ───────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg2 \
        apt-transport-https \
        unixodbc \
        libxml2 \
        libpam0g \
        libstdc++6 \
    && curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor \
        -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] \
        https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends \
        msodbcsql18 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── PowerShell 7 + Az modules (Partner Admin Link linking) ────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
        -O /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && rm /tmp/packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends powershell \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN pwsh -NoLogo -NonInteractive -Command \
    "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; \
     Install-Module -Name Az.Accounts,Az.ManagementPartner -Force -AllowClobber -Scope AllUsers -Repository PSGallery"

WORKDIR /app

# ── Python packages from build stage (no pip compile needed) ──────────────────
COPY --from=py-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=py-deps /usr/local/bin /usr/local/bin

# ── Application code ───────────────────────────────────────────────────────────
COPY app/ app/

# ── Frontend assets (FastAPI serves these as static files at /) ───────────────
COPY --from=node-builder /ui/dist/ static/

# ── Reports directory (mount as volume in production) ─────────────────────────
RUN mkdir -p reports

# ── Non-root user ──────────────────────────────────────────────────────────────
RUN groupadd -r appuser && useradd -r -g appuser appuser \
 && chown -R appuser:appuser /app
USER appuser

# ── Environment ────────────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LOG_LEVEL=INFO \
    STATIC_DIR=/app/static \
    REPORTS_DIR=/app/reports

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75"]
