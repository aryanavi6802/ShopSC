#!/usr/bin/env bash
# Build and (re)start the production stack, then wait until the API is healthy.
# Used by setup-ec2.sh and by the GitHub Actions deploy job.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

echo "==> Waiting for the backend to report healthy"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T backend wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "==> Healthy"
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 5
done

echo "Backend did not become healthy. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail=50 backend >&2
exit 1
