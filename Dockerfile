# syntax=docker/dockerfile:1

FROM node:20-alpine AS dashboard-build
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3110
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js tools.js store.js syslog.js ./
COPY --from=dashboard-build /app/dashboard/dist ./dashboard/dist
EXPOSE 3110
CMD ["node", "index.js"]
