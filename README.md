# Will It Ship?

A trade finance platform built on Ethereum for managing bill of lading smart contracts.

## Overview

### Quick Start

**Run all services (Docker):**
```bash
./cmd/run-all.sh
```
Builds every image and starts the stack. Use `./cmd/stop-all.sh` to stop the containers.

**Individual services:**
Example for running smart contract
```bash
./cmd/run-ethereum.sh  # The chain
./cmd/run-smart-contract.sh  # Deploy contract
./cmd/run-api.sh  # The API and block listeners
./cmd/run-fe.sh  # Front end application            
```

## Services

• Frontend: `http://localhost:8080`
• Smart Contract API: `http://localhost:8004`
• Swagger Docs: `http://localhost:8004/docs`
• Ethereum Local Chain: `http://localhost:8545` (Chain ID: 31337)
• Database: Hosted on **Supabase** (PostgreSQL). Access through your dashboard.
