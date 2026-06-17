#!/usr/bin/env bash
# Run on the production server from the GrammarBuddy repo (or: bash deploy/deploy.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SHARED_NETWORK="${GRAMMARBUDDY_SHARED_NETWORK:-beingdigital-shared}"
PUBLIC_HEALTH_URL="${GRAMMARBUDDY_HEALTH_URL:-https://www.beingdigital.cn/GrammerBuddy/health}"
SKIP_BUILD="${SKIP_BUILD:-0}"

echo "=== GrammarBuddy deploy ==="
echo "Repo:      $REPO_ROOT"
echo "Network:   $SHARED_NETWORK"
echo "Health:    $PUBLIC_HEALTH_URL"

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "ERROR: docker compose not found."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running or current user lacks permission."
  exit 1
fi

if ! docker network inspect "$SHARED_NETWORK" >/dev/null 2>&1; then
  echo "Creating docker network: $SHARED_NETWORK"
  docker network create "$SHARED_NETWORK"
fi

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env not found."
  echo "  cp backend/.env.example backend/.env"
  echo "  Set DASHSCOPE_API_KEY and CORS_ORIGINS=https://www.beingdigital.cn,https://beingdigital.cn"
  exit 1
fi

mkdir -p backend/data/news_history

if [[ "$SKIP_BUILD" == "1" ]]; then
  echo "SKIP_BUILD=1 — skipping image build"
else
  echo "=== Building images ==="
  "${DC[@]}" build
fi

echo "=== Starting containers ==="
"${DC[@]}" up -d

echo "=== Waiting for startup ==="
sleep 6

echo "=== Container status ==="
"${DC[@]}" ps

echo "=== Internal health (grammarbuddy-web) ==="
INTERNAL_OK=0
for _ in 1 2 3 4 5; do
  if docker exec grammarbuddy-web wget -qO- http://127.0.0.1/GrammerBuddy/health 2>/dev/null | grep -q '"status"'; then
    INTERNAL_OK=1
    break
  fi
  sleep 3
done

if [[ "$INTERNAL_OK" == "1" ]]; then
  echo "OK  /GrammerBuddy/health inside web container"
else
  echo "WARN  internal health check failed"
  "${DC[@]}" logs --tail=30 api web || true
fi

if command -v curl >/dev/null 2>&1; then
  echo "=== Public health (via mySite HTTPS) ==="
  HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_HEALTH_URL" || echo "000")"
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "OK  $PUBLIC_HEALTH_URL"
  else
    echo "WARN  HTTP $HTTP_CODE from $PUBLIC_HEALTH_URL"
    echo "      Add deploy/mysite-nginx-snippet.conf to mySite ngx/conf.d/default.conf and redeploy mySite."
  fi
fi

echo "=== Deploy finished ==="
