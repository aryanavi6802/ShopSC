# Backend (Express API). Build from the REPO ROOT so ../shared is available:
#   docker build -f backend/Dockerfile -t shopsc-backend .
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install only the backend workspace's production dependencies (cached unless manifests change).
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --omit=dev --no-audit --no-fund && npm cache clean --force

COPY shared ./shared
COPY backend ./backend

WORKDIR /app/backend
RUN mkdir -p uploads && chown -R node:node uploads
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "src/server.js"]
