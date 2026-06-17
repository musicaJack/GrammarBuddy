#!/usr/bin/env bash
# One-time: configure Docker Hub pull acceleration on the production server (China).
# Usage: sudo bash deploy/setup-docker-mirror.sh
set -euo pipefail

DAEMON_JSON="/etc/docker/daemon.json"
BACKUP="${DAEMON_JSON}.bak.$(date +%Y%m%d%H%M%S)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root: sudo bash deploy/setup-docker-mirror.sh"
  exit 1
fi

mkdir -p /etc/docker

if [[ -f "$DAEMON_JSON" ]]; then
  cp "$DAEMON_JSON" "$BACKUP"
  echo "Backed up to $BACKUP"
fi

# Mirror URLs may change; update if pulls still slow.
cat > "$DAEMON_JSON" << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ],
  "max-concurrent-downloads": 10
}
EOF

echo "Wrote $DAEMON_JSON:"
cat "$DAEMON_JSON"

systemctl daemon-reload
systemctl restart docker

echo ""
echo "Docker mirror configured. Test with:"
echo "  docker pull python:3.11-slim"
echo ""
echo "Then rebuild GrammarBuddy:"
echo "  cd ~/code/GrammarBuddy && docker-compose build"
