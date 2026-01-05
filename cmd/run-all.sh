#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Starting all services with Docker..."

# Start Ethereum chain first (needed for contract deployment)
echo "📦 Starting Ethereum chain..."
./cmd/run-ethereum.sh &
ETH_PID=$!

# Wait for Ethereum to be ready
echo "⏳ Waiting for Ethereum node to be ready..."
for i in {1..30}; do
    # Check if Ethereum container is running (no local tools needed)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "hardhat-node\|ethereum.*hardhat"; then
        # Give it a moment to fully start
        sleep 2
        echo "✅ Ethereum node is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Ethereum node failed to start"
        exit 1
    fi
    sleep 1
done

# Deploy contracts
echo "📝 Deploying smart contracts..."
./cmd/run-smart-contract.sh

# Start all Docker services (Frontend, Backend API)
echo "🐳 Starting Docker services (Frontend, Backend API)..."
echo "📺 Logs will be shown in real-time. Press Ctrl+C to stop."
echo ""
if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.yaml up --build
else
  docker-compose -f docker-compose.yaml up --build
fi

