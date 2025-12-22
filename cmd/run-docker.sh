#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🐳 Starting Docker services with real-time logs..."
echo "📺 All logs will be displayed in this terminal"
echo "Press Ctrl+C to stop all services"
echo ""

if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.yaml up --build
else
  docker-compose -f docker-compose.yaml up --build
fi

