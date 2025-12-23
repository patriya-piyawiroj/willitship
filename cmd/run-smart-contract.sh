#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Compiling and deploying smart contracts..."

# Ensure Ethereum chain is running
if ! docker compose -f ethereum/docker-compose.yml ps hardhat-node 2>/dev/null | grep -q "Up"; then
    echo "⚠️  Ethereum chain not running. Starting it..."
    ./cmd/run-ethereum.sh
    sleep 5
fi

# Compile contracts in the running Hardhat container
echo "📦 Compiling contracts..."
docker compose -f ethereum/docker-compose.yml exec -T hardhat-node sh -c "cd /app && npx hardhat clean && npx hardhat compile"

# Copy artifacts to host
echo "📋 Copying artifacts..."
mkdir -p ethereum/artifacts
docker compose -f ethereum/docker-compose.yml exec -T hardhat-node sh -c "tar -czf - -C /app artifacts" | tar -xzf - -C ethereum/

echo "✅ Contracts compiled!"
echo ""

# Deploy contracts
echo "🚀 Deploying contracts..."
docker build -f smart-contract/Dockerfile.deploy -t willitship-deploy ./smart-contract

# Find Ethereum network
ETH_NETWORK=$(docker network ls --format '{{.Name}}' | grep -E "ethereum.*network|ethereum-network" | head -1)

if [ -n "$ETH_NETWORK" ] && docker network inspect "$ETH_NETWORK" >/dev/null 2>&1; then
    CONTAINER_ON_NETWORK=$(docker network inspect "$ETH_NETWORK" --format '{{range .Containers}}{{.Name}}{{end}}' | grep -i hardhat)
    if [ -n "$CONTAINER_ON_NETWORK" ]; then
        ETH_RPC="http://hardhat-node:8545"
        NETWORK_ARG="--network $ETH_NETWORK"
    else
        ETH_RPC="http://host.docker.internal:8545"
        NETWORK_ARG="--add-host=host.docker.internal:host-gateway"
    fi
else
    ETH_RPC="http://host.docker.internal:8545"
    NETWORK_ARG="--add-host=host.docker.internal:host-gateway"
fi

# Run deployment
docker run --rm \
    $NETWORK_ARG \
    -v "$(pwd)/smart-contract/deployments.json:/app/deployments.json" \
    -v "$(pwd)/ethereum/artifacts:/app/artifacts:ro" \
    -v "$(pwd)/.env:/app/.env:ro" \
    -e RPC_URL="$ETH_RPC" \
    willitship-deploy

# Copy deployments.json to frontend
if [ -f "smart-contract/deployments.json" ]; then
    cp smart-contract/deployments.json fe/public/deployments.json
    echo "✅ Copied deployments.json to frontend"
fi

echo ""
echo "✅ Deployment complete!"
