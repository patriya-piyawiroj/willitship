#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Starting frontend..."

# Stop existing container
docker compose stop fe 2>/dev/null || true
docker compose rm -f fe 2>/dev/null || true

# Start service
docker compose up --build fe
