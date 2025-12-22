#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Starting all services with Docker..."

# Start Ethereum chain first (needed for contract deployment)
echo "📦 Starting Ethereum chain..."
./cmd/run-ethereum.sh

# Wait for Ethereum to be ready
echo "⏳ Waiting for Ethereum node to be ready..."
sleep 15

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

