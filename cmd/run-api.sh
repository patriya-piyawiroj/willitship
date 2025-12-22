#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

PORT="${PORT:-8004}"

echo "🚀 Starting API service in Docker on port $PORT..."
echo "📺 Server logs will be shown in real-time. Press Ctrl+C to stop."
echo ""

# Check if we're using Colima and set context if needed
if command -v colima >/dev/null 2>&1; then
    if colima status >/dev/null 2>&1; then
        # Colima is running, switch to colima context
        echo "🔄 Using Colima Docker context..."
        docker context use colima 2>/dev/null || true
        # Verify context was set
        CURRENT_CONTEXT=$(docker context show 2>/dev/null || echo "")
        if [ "$CURRENT_CONTEXT" != "colima" ]; then
            echo "⚠️  Warning: Could not switch to colima context (current: $CURRENT_CONTEXT)"
        fi
    else
        echo "⚠️  Colima is installed but not running. Starting Colima..."
        colima start || {
            echo "❌ Failed to start Colima. Please start it manually: colima start"
            exit 1
        }
        docker context use colima 2>/dev/null || true
    fi
fi

# Check if Docker is accessible
# Give it a moment after context switch, then test
sleep 0.5
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not accessible."
    echo ""
    echo "Debug info:"
    echo "  Docker context: $(docker context show 2>/dev/null || echo 'unknown')"
    echo "  DOCKER_HOST: ${DOCKER_HOST:-not set}"
    if command -v colima >/dev/null 2>&1; then
        echo "  Colima socket: $([ -S "${HOME}/.colima/default/docker.sock" ] && echo 'exists' || echo 'missing')"
        echo "  Colima status: $(colima status 2>&1 | head -1 || echo 'unknown')"
        echo ""
        echo "Attempting to fix by restarting Colima connection..."
        # Try restarting Colima to refresh the connection
        colima stop default 2>/dev/null || true
        sleep 2
        colima start default 2>/dev/null || true
        sleep 3
        docker context use colima 2>/dev/null || true
        
        if docker info >/dev/null 2>&1; then
            echo "✅ Docker is now accessible after Colima restart!"
        else
            echo "❌ Still not accessible after restart."
            echo ""
            echo "Troubleshooting:"
            echo "  1. Try manually: colima stop && colima start"
            echo "  2. Try: docker context use colima && docker info"
            echo "  3. Check Colima logs: colima logs"
            exit 1
        fi
    else
        echo ""
        echo "Troubleshooting:"
        echo "  1. If using Docker Desktop: Make sure it's running"
        echo "  2. Check: docker info"
        exit 1
    fi
fi

# Stop any existing smart-contract container
echo "🛑 Stopping any existing API container..."
if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yaml stop smart-contract 2>/dev/null || true
    docker compose -f docker-compose.yaml rm -f smart-contract 2>/dev/null || true
else
    docker-compose -f docker-compose.yaml stop smart-contract 2>/dev/null || true
    docker-compose -f docker-compose.yaml rm -f smart-contract 2>/dev/null || true
fi

echo "✅ Previous instance stopped (if any)."
echo ""

# Start the API service in Docker with real-time logs
echo "🐳 Starting API service in Docker..."
echo ""

if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yaml up --build smart-contract
else
    docker-compose -f docker-compose.yaml up --build smart-contract
fi

