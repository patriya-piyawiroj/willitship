#!/usr/bin/env bash
set -euo pipefail

echo "Starting local Ethereum chain..."

# Start Docker containers
docker-compose up -d

echo "Waiting for Hardhat node to be ready..."
sleep 10

echo "✅ Local Ethereum chain is running!"
echo ""
echo "RPC URL: http://localhost:8545"
echo "Block Explorer: http://localhost:4000"
echo ""
echo "To stop the chain, run: docker-compose down"

