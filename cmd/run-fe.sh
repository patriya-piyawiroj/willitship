#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

PORT="${PORT:-8080}"

echo "🚀 Starting frontend in Docker on port $PORT..."
echo "📺 Server logs will be shown in real-time. Press Ctrl+C to stop."
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not accessible."
    echo ""
    echo "Troubleshooting:"
    if command -v colima >/dev/null 2>&1; then
        echo "  1. Try: docker context use colima"
        echo "  2. Try: colima start"
    fi
    echo "  3. Check: docker info"
    echo "  4. If using Docker Desktop: Make sure it's running"
    exit 1
fi

# Check if we're using Colima and set context if needed
if command -v colima >/dev/null 2>&1; then
    if colima status >/dev/null 2>&1; then
        # Colima is running, switch to colima context
        echo "🔄 Using Colima Docker context..."
        docker context use colima 2>/dev/null || true
    else
        echo "⚠️  Colima is installed but not running. Starting Colima..."
        colima start || {
            echo "❌ Failed to start Colima. Please start it manually: colima start"
            exit 1
        }
        docker context use colima 2>/dev/null || true
    fi
fi

# Stop any existing fe container
echo "🛑 Stopping any existing frontend container..."
if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yaml stop fe 2>/dev/null || true
    docker compose -f docker-compose.yaml rm -f fe 2>/dev/null || true
else
    docker-compose -f docker-compose.yaml stop fe 2>/dev/null || true
    docker-compose -f docker-compose.yaml rm -f fe 2>/dev/null || true
fi

echo "✅ Previous instance stopped (if any)."
echo ""

# Start the frontend service in Docker with real-time logs
echo "🐳 Starting frontend service in Docker..."
echo ""

if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yaml up --build fe
else
    docker-compose -f docker-compose.yaml up --build fe
fi

