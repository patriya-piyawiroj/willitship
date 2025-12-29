#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../ethereum"

echo "🚀 Starting local Ethereum chain (fresh blockchain state)..."

# Stop existing containers and clean up volumes
if docker compose ps -q 2>/dev/null | grep -q .; then
    echo "🛑 Stopping existing containers and removing volumes..."
    docker compose down -v --remove-orphans
    sleep 2
fi

# Additional cleanup - remove any orphaned containers/networks
echo "🧹 Cleaning up any orphaned resources..."
docker system prune -f >/dev/null 2>&1 || true

# Start containers
echo "🚀 Starting Ethereum chain..."
docker compose up -d

# Wait for node to be ready
echo "⏳ Waiting for Hardhat node to be ready..."
for i in {1..30}; do
    if docker compose exec -T hardhat-node curl -s -f -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://localhost:8545 >/dev/null 2>&1; then
        echo "✅ Ethereum chain is running!"
        echo ""
        echo "RPC URL: http://localhost:8545"
        echo "Block Explorer: http://localhost:4000"
        exit 0
    fi
    sleep 1
done

echo "❌ Ethereum chain failed to start"
exit 1
