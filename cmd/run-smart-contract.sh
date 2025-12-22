#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Compiling and deploying smart contracts in Docker..."
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

# Ensure Ethereum chain is running
echo "🔗 Checking Ethereum chain connection..."
# Check if Ethereum container is running (no local tools needed)
ETH_CONTAINER_RUNNING=false
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "hardhat-node\|ethereum.*hardhat"; then
    ETH_CONTAINER_RUNNING=true
fi

# Also check if port is accessible (using Docker if available, otherwise basic check)
if [ "$ETH_CONTAINER_RUNNING" = false ]; then
    echo "⚠️  Ethereum chain not detected"
    echo "   Starting Ethereum chain..."
    ./cmd/run-ethereum.sh &
    ETH_PID=$!
    echo "   Waiting for chain to be ready..."
    for i in {1..30}; do
        # Check if container is running
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "hardhat-node\|ethereum.*hardhat"; then
            # Give it a moment to fully start
            sleep 2
            echo "✅ Ethereum chain is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "❌ Ethereum chain failed to start"
            exit 1
        fi
        sleep 1
    done
else
    echo "✅ Ethereum chain is running"
fi
echo ""

# Compile contracts using Docker
echo "📦 Compiling contracts in Docker..."
cd "$SCRIPT_DIR/../ethereum"

# Build the hardhat container if needed
if docker compose version >/dev/null 2>&1; then
    docker compose build hardhat-node
    docker compose run --rm hardhat-node npm run compile
else
    docker-compose build hardhat-node
    docker-compose run --rm hardhat-node npm run compile
fi

echo "✅ Contracts compiled!"
echo ""

# Deploy contracts using Docker
echo "🚀 Deploying contracts in Docker..."
cd "$SCRIPT_DIR/.."

# Build and run deployment container
docker build -f smart-contract/Dockerfile.deploy -t willitship-deploy ./smart-contract

# Find the Ethereum network name (Docker Compose creates networks with directory prefix)
ETH_NETWORK=$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -E "ethereum.*network|ethereum-network" | head -1)

# Check if network exists and container is on it, if not use host.docker.internal
if [ -n "$ETH_NETWORK" ] && docker network inspect "$ETH_NETWORK" >/dev/null 2>&1; then
    # Check if hardhat-node container is on this network
    CONTAINER_ON_NETWORK=$(docker network inspect "$ETH_NETWORK" --format '{{range .Containers}}{{.Name}}{{end}}' 2>/dev/null | grep -i hardhat)
    if [ -n "$CONTAINER_ON_NETWORK" ]; then
        # Use Docker network to connect to Ethereum node
        ETH_RPC="http://hardhat-node:8545"
        NETWORK_ARG="--network $ETH_NETWORK"
    else
        # Network exists but container not on it, use host gateway
        ETH_RPC="http://host.docker.internal:8545"
        NETWORK_ARG="--add-host=host.docker.internal:host-gateway"
    fi
else
    # Fallback to host.docker.internal (for macOS/Windows or if network not found)
    ETH_RPC="http://host.docker.internal:8545"
    NETWORK_ARG="--add-host=host.docker.internal:host-gateway"
fi

# Run deployment with volumes mounted
docker run --rm \
    $NETWORK_ARG \
    -v "$(pwd)/smart-contract/deployments.json:/app/deployments.json" \
    -v "$(pwd)/ethereum/artifacts:/app/artifacts:ro" \
    -v "$(pwd)/.env:/app/.env:ro" \
    -e RPC_URL="$ETH_RPC" \
    willitship-deploy

echo ""
echo "✅ Smart contracts deployed!"
echo ""
echo "Check deployments.json for contract addresses and account information."
echo ""

# Note: API service should be started separately using ./cmd/run-api.sh
echo ""
echo "💡 To start the API service, run: ./cmd/run-api.sh"
echo "   (This will start the API in Docker with real-time logs)"

