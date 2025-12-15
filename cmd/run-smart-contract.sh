#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../smart-contract"

PORT="${PORT:-8001}"
export PORT

exec ./run.sh

