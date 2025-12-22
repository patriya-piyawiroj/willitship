#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../smart-contract"

PORT="${PORT:-8004}"

echo "Compiling and deploying smart contracts..."

# Compile contracts (using Hardhat from ethereum folder)
echo "Compiling contracts..."
cd "$SCRIPT_DIR/../ethereum"
npm install
npm run compile

# Deploy contracts (using Python)
echo "Deploying contracts..."
cd "$SCRIPT_DIR/../smart-contract"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
python3 scripts/deploy.py

echo ""
echo "✅ Smart contracts deployed!"
echo ""
echo "Check deployments.json for contract addresses and account information."
echo ""

# Note: API service should be started separately using ./cmd/run-api.sh
# which runs it in Docker for consistency and ease of use
echo ""
echo "💡 To start the API service, run: ./cmd/run-api.sh"
echo "   (This will start the API in Docker with real-time logs)"

