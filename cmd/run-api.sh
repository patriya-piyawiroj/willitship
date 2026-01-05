#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Starting API service..."

# Stop existing container
docker compose stop smart-contract 2>/dev/null || true
docker compose rm -f smart-contract 2>/dev/null || true

# Start service
docker compose up --build smart-contract
