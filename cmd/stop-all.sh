#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if docker compose version >/dev/null 2>&1; then
  docker compose down
else
  docker-compose down
fi

