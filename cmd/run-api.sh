#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Starting API service..."

# Stop existing container
docker compose stop smart-contract 2>/dev/null || true
docker compose rm -f smart-contract 2>/dev/null || true

# Start service in background
docker compose up -d --build smart-contract

echo "✅ API service started in background"
echo "📡 API available at: http://localhost:8004"
echo "🌐 Container accessible at: http://smart-contract:8004"
