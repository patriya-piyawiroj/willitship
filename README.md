# Will It Ship?

A trade finance platform built on Ethereum for managing bill of lading smart contracts.

## Overview

### Quick Start

**Prerequisites:**
- Docker (or Docker Desktop / Colima)
- No local Node.js, Python, npm, or pip installations required - everything runs in containers!

**Run all services (Docker):**
```bash
./cmd/run-all.sh
```
Builds every image and starts the stack. Use `./cmd/stop-all.sh` to stop the containers.

**Individual services (all containerized):**
```bash
./cmd/run-ethereum.sh      # Ethereum local chain (Hardhat node in Docker)
./cmd/run-smart-contract.sh  # Compile & deploy contracts (runs in Docker)
./cmd/run-api.sh           # API service (FastAPI in Docker)
./cmd/run-fe.sh            # Frontend (Next.js in Docker)
```

All scripts automatically:
- Check for Docker/Colima and start if needed
- Build required Docker images
- Run services in containers with real-time logs

## Services

• Frontend: `http://localhost:8080`
• Smart Contract API: `http://localhost:8004`
• Swagger Docs: `http://localhost:8004/docs`
• Ethereum Local Chain: `http://localhost:8545` (Chain ID: 31337)
• Database: Hosted on **Supabase** (PostgreSQL). Access through your dashboard.
