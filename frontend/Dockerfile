# ─────────────────────────────────────────────────────────────────────────────
# Frontend — Source Assessment Tool UI
# Stage 1 : Node 20  → build Vite/React app
# Stage 2 : Nginx    → serve static files + proxy /api to backend
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /build

# Install dependencies first (better layer caching — only re-runs on package change)
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
COPY . .
RUN npm run build
# Produces /build/dist/

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Inject our config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built assets from build stage
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
