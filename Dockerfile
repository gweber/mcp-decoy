# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS dashboard-build
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3110 \
    STORE_BACKEND=sqlite \
    SQLITE_PATH=/data/mcp-decoy.db \
    LOG_RETENTION_DAYS=90
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js tools.js store.js syslog.js ./
COPY --from=dashboard-build /app/dashboard/dist ./dashboard/dist
EXPOSE 3110
CMD ["node", "index.js"]
