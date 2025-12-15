# willitship

## Overview
This repo scaffolds three Python FastAPI microservices so you can run everything locally via Docker or helper scripts.

## Services

- `smart-contract` → FastAPI microservice on port 8001 exposing `GET /test`.
- `ocr` → FastAPI microservice on port 8002 exposing `GET /test`.
- `risk` → FastAPI microservice on port 8003 exposing `GET /test`.
Each service contains a runnable `run.sh` helper to start it independently.

## Running

### Docker (all services)
```bash
./cmd/run-all.sh
```
Builds every image and starts the stack (the scripts autodetect whether to use `docker compose` or `docker-compose`). Use `./cmd/stop-all.sh` to stop the containers.

### Local development
```
./cmd/run-smart-contract.sh
./cmd/run-ocr.sh
./cmd/run-risk.sh
./cmd/run-risk.sh
```
Each script sets a default port (8001/8002/8003) and proxies the `PORT` environment variable if you need a different one.