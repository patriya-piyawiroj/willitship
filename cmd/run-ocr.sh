#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../ocr"

PORT="${PORT:-8002}"
export PORT

exec ./run.sh

