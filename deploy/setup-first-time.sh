#!/usr/bin/env bash
# One-time server bootstrap. Example:
#   bash deploy/setup-first-time.sh /home/lighthouse/GrammarBuddy git@github.com:owner/GrammarBuddy.git
set -euo pipefail

DEPLOY_PATH="${1:-$HOME/GrammarBuddy}"
REPO_URL="${2:-}"

echo "=== GrammarBuddy first-time setup ==="
echo "Deploy path: $DEPLOY_PATH"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker not installed. Install Docker before continuing."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  echo "Docker Compose: $(docker compose version)"
elif command -v docker-compose >/dev/null 2>&1; then
  echo "Docker Compose: $(docker-compose --version)"
else
  echo "ERROR: docker compose not found."
  exit 1
fi

NETWORK="${GRAMMARBUDDY_SHARED_NETWORK:-beingdigital-shared}"
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Creating network: $NETWORK"
  docker network create "$NETWORK"
else
  echo "Network exists: $NETWORK"
fi

if [[ -d "$DEPLOY_PATH/.git" ]]; then
  echo "Repo already cloned: $DEPLOY_PATH"
else
  if [[ -z "$REPO_URL" ]]; then
    echo "ERROR: directory missing and no REPO_URL given."
    echo "Usage: bash deploy/setup-first-time.sh /home/lighthouse/GrammarBuddy git@github.com:owner/GrammarBuddy.git"
    exit 1
  fi
  mkdir -p "$(dirname "$DEPLOY_PATH")"
  git clone "$REPO_URL" "$DEPLOY_PATH"
fi

cd "$DEPLOY_PATH"

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo ""
  echo "Created backend/.env from example."
  echo "Edit it now (DASHSCOPE_API_KEY + CORS_ORIGINS), then re-run:"
  echo "  bash deploy/deploy.sh"
  echo ""
  exit 0
fi

bash deploy/deploy.sh

echo ""
echo "Next: add mySite nginx snippet (deploy/mysite-nginx-snippet.conf) and redeploy mySite."
echo "Then open: https://www.beingdigital.cn/GrammerBuddy/?device=1"
