from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
import os
import asyncio
import json
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import logging
from web3 import Web3
from pathlib import Path
from typing import Optional, List

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    # Fallback to current directory
    load_dotenv()

from .core.events import EventListener
from .schemas.shipment import ShipmentRequest, ShipmentResponse
from .schemas.offer import OfferResponse
from .models.bill_of_lading import BillOfLading as BillOfLadingModel, Offer as OfferModel
from .core.blockchain import (
    get_web3,
    get_account,
    get_account_address,
    load_deployments,
    load_contract_abi,
)

# Import service routers
from .routers.shipments import router as shipment_router
from .routers.wallets import router as wallets_router
from .routers.offers import router as offers_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global event listener instance
event_listener: EventListener = None
listener_task: asyncio.Task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    global event_listener, listener_task
    
    # Startup
    logger.info("Starting smart contract API service...")
    
    # Initialize event listener
    try:
        # In Docker, always use host.docker.internal to reach host machine
        # This ensures we can reach the host machine's Ethereum node
        if os.path.exists("/.dockerenv"):
            rpc_url = "http://host.docker.internal:8545"
            logger.info("Running in Docker, using RPC URL: http://host.docker.internal:8545")
        else:
            # Local development - use env var or default to localhost
            rpc_url = os.getenv("RPC_URL", "http://localhost:8545")
            logger.info(f"Running locally, using RPC URL: {rpc_url}")
        # Use local PostgreSQL Docker service (same as database.py)
        db_connection_string = "postgresql://postgres:postgres123@db:5432/willitship"
        
        # Path to deployments.json - always use Docker volume mount path
        # Since we always run in Docker, only check /app/deployments.json
        deployments_file = "/app/deployments.json"
        
        logger.info(f"🔍 Looking for deployments.json at: {deployments_file}")
        if os.path.exists(deployments_file):
            logger.info(f"   ✅ {deployments_file}")
        else:
            logger.warning(f"   ❌ {deployments_file}")
        
        listener_task = None
        if not os.path.exists(deployments_file):
            logger.warning("⚠️  deployments.json not found at /app/deployments.json, event listener will not start")
            logger.warning("   Make sure the volume is mounted in docker-compose.yaml")
        else:
            logger.info(f"✅ Using deployments file: {deployments_file}")
            try:
                event_listener = EventListener(rpc_url, db_connection_string, deployments_file)
                
                # Start event listener in background
                listener_task = asyncio.create_task(event_listener.listen())
                logger.info("✅ Event listener started and running in background")
            except Exception as e:
                logger.error(f"❌ Failed to initialize event listener: {e}", exc_info=True)
                logger.warning("Continuing without event listener...")
    except Exception as e:
        logger.error(f"Failed to start event listener: {e}")
        logger.warning("Continuing without event listener...")
    
    yield
    
    # Shutdown
    logger.info("Shutting down database service...")
    if listener_task:
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Will It Ship? - Smart Contract API",
    description="API service for managing bill of lading smart contracts on Ethereum",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI at http://localhost:8004/docs
    redoc_url="/redoc",  # ReDoc at http://localhost:8004/redoc
    openapi_url="/openapi.json",  # OpenAPI schema at http://localhost:8004/openapi.json
    lifespan=lifespan
)

# Configure CORS to handle preflight OPTIONS requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins like ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods including OPTIONS
    allow_headers=["*"],
)

# Include service routers
app.include_router(shipment_router, prefix="/shipments", tags=["shipments"])
app.include_router(wallets_router, prefix="/wallets", tags=["wallets"])
app.include_router(offers_router, prefix="/offers", tags=["offers"])

