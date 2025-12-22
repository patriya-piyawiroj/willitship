# Ethereum Local Node

This folder contains the infrastructure for running a local Ethereum blockchain using Hardhat.

## What's Here

- **Docker setup**: Docker Compose configuration for running Hardhat node
- **Hardhat configuration**: Compiles contracts from `../smart-contract/contracts`
- **Block explorer**: Web interface for viewing blockchain state
- **Node.js dependencies**: Required for Hardhat compilation

## Usage

### Start the Ethereum node

```bash
./cmd/run-ethereum.sh
```

Or manually:

```bash
cd ethereum
docker-compose up -d
```

### Compile contracts

```bash
cd ethereum
npm install
npm run compile
```

This compiles contracts from `../smart-contract/contracts` and generates artifacts.

### Access

- **RPC URL**: http://localhost:8545
- **Block Explorer**: http://localhost:4000

### Stop

```bash
cd ethereum
docker-compose down
```

## Architecture

- Hardhat node runs in Docker container
- Compiles Solidity contracts from `smart-contract/contracts/`
- Artifacts (ABI, bytecode) are generated here for use by deployment scripts
- Block explorer provides web interface to view blockchain state

