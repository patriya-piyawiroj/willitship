# Project Structure

## Overview

This project is organized into separate folders for different concerns:

- **`ethereum/`** - Ethereum blockchain infrastructure
- **`smart-contract/`** - Pure Solidity contracts and deployment
- **`fe/`** - Frontend application
- **`ocr/`** - OCR service
- **`risk/`** - Risk assessment service

## Ethereum (`ethereum/`)

**Purpose**: Local Ethereum blockchain infrastructure

**Contains**:
- Docker setup for Hardhat node
- Hardhat configuration
- Block explorer web interface
- Node.js dependencies for compilation

**Usage**:
```bash
./cmd/run-ethereum.sh
```

**What it does**:
- Runs Hardhat node in Docker
- Compiles contracts from `../smart-contract/contracts/`
- Provides RPC endpoint at `http://localhost:8545`
- Serves block explorer at `http://localhost:4000`

## Smart Contracts (`smart-contract/`)

**Purpose**: Pure on-chain contracts and deployment scripts

**Contains**:
- Solidity contract source files (`contracts/`)
- Python deployment scripts (`scripts/`)
- Contract documentation

**Usage**:
```bash
./cmd/run-smart-contract.sh
```

**What it does**:
- Compiles contracts (via Hardhat in `ethereum/`)
- Deploys contracts to the blockchain (via Python)
- Saves deployment info to `deployments.json`

## Workflow

1. **Start Ethereum node**: `./cmd/run-ethereum.sh`
2. **Deploy contracts**: `./cmd/run-smart-contract.sh`
3. **Start all services**: `./cmd/run-all.sh`

## Key Files

- `cmd/run-ethereum.sh` - Start local Ethereum chain
- `cmd/run-smart-contract.sh` - Deploy contracts
- `cmd/run-all.sh` - Start everything
- `ethereum/docker-compose.yml` - Ethereum infrastructure
- `smart-contract/scripts/deploy.py` - Contract deployment

