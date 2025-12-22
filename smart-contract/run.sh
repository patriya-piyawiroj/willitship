#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8004}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check if we're in a virtual environment, if not create/activate one
if [ -z "${VIRTUAL_ENV:-}" ]; then
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    echo "Activating virtual environment..."
    source venv/bin/activate
    
    # Install dependencies if needed
    if ! python -c "import uvicorn" 2>/dev/null; then
        echo "Installing dependencies..."
        pip install -q -r requirements.txt
    fi
fi

# Run the API from the api directory
exec uvicorn api.main:app --host 0.0.0.0 --port "$PORT"

