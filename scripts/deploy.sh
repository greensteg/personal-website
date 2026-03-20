#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building and starting container..."
docker compose up --build -d

echo "==> Waiting for server to respond..."
for i in $(seq 1 10); do
    if curl -sf http://localhost > /dev/null 2>&1; then
        echo "==> Site is live at http://localhost"
        exit 0
    fi
    sleep 1
done

echo "==> Warning: server did not respond within 10s. Check logs:"
echo "    docker compose logs"
exit 1
