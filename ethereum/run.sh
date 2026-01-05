#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

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

echo "🚀 Starting local Ethereum chain in Docker..."

# Start Docker containers
if docker compose version >/dev/null 2>&1; then
    docker compose up -d
else
    docker-compose up -d
fi

echo "⏳ Waiting for Hardhat node to be ready..."
sleep 10

# Check if node is ready (using Docker exec, no local curl needed)
for i in {1..30}; do
    # Find the hardhat-node container
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "hardhat-node|ethereum.*hardhat" | head -1)
    if [ -n "$CONTAINER_NAME" ]; then
        # Container exists, check if RPC is responding (curl is installed in the container)
        if docker exec "$CONTAINER_NAME" curl -s -f -X POST -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            http://localhost:8545 >/dev/null 2>&1; then
            echo "✅ Local Ethereum chain is running!"
            echo ""
            echo "RPC URL: http://localhost:8545"
            echo "Block Explorer: http://localhost:4000"
            echo ""
            echo "To stop the chain, run: docker compose down (or docker-compose down)"
            exit 0
        fi
    fi
    sleep 1
done

echo "❌ Ethereum chain failed to start. Check logs with: docker compose logs"
exit 1

