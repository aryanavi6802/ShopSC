# Frontend (Next.js, standalone output). Build from the REPO ROOT:
#   docker build -f frontend/Dockerfile -t shopsc-frontend .
# NEXT_PUBLIC_* values are baked in at build time, so they are build args.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_DEMO_MODE=true
ARG NEXT_PUBLIC_LOG_MODE=disabled
ARG NEXT_PUBLIC_USE_JWT_ZK_LOGIN=false
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
# Only used for the dev-style /api rewrite inside Next; in production Caddy routes /api directly.
ARG BACKEND_URL=http://backend:4000
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_LOG_MODE=$NEXT_PUBLIC_LOG_MODE \
    NEXT_PUBLIC_USE_JWT_ZK_LOGIN=$NEXT_PUBLIC_USE_JWT_ZK_LOGIN \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    BACKEND_URL=$BACKEND_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY frontend ./frontend
RUN npm --workspace frontend run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Standalone bundle mirrors the monorepo layout, so the server lives at frontend/server.js.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
