from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
import os
import asyncio
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

from .event_listener import EventListener
from .schemas import ShipmentRequest, ShipmentResponse
from .models import BillOfLading as BillOfLadingModel
from .blockchain import (
    get_web3,
    get_account,
    get_account_address,
    load_deployments,
    hash_shipment_data,
    create_bol,
    load_contract_abi,
)

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
        db_password = os.getenv("DB_PASSWORD", "")
        # Use transaction pooler connection string for IPv4 compatibility
        # This avoids IPv6 issues in Docker containers
        db_connection_string = f"postgresql://postgres.myvcenyferzzohepsauv:{db_password}@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
        
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
    allow_origins=["*"],  # In production, replace with specific origins like ["http://localhost:8080"]
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods including OPTIONS
    allow_headers=["*"],
)

# Database connection string
# Use transaction pooler for IPv4 compatibility
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_CONNECTION_STRING = f"postgresql://postgres.myvcenyferzzohepsauv:{DB_PASSWORD}@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"

# Create SQLAlchemy engine
# Using NullPool to avoid connection pooling issues with Supabase
engine = create_engine(
    DB_CONNECTION_STRING,
    poolclass=NullPool,
    echo=False
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/test")
def test_endpoint():
    """Test endpoint to verify service is running."""
    return {
        "service": "smart-contract-api",
        "status": "ok",
        "message": "hello from smart contract API service",
    }


@app.get("/health")
def health_check():
    """Health check endpoint that verifies database connection."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()
        
        # Check event listener status
        listener_status = "running" if listener_task and not listener_task.done() else "stopped"
        
        return {
            "status": "healthy",
            "database": "connected",
            "event_listener": listener_status,
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection failed: {str(e)}"
        )


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "service": "smart-contract-api",
        "description": "Smart Contract API service for WillitShip",
        "event_listener": "active" if listener_task and not listener_task.done() else "inactive",
    }


@app.get("/wallets")
def get_wallets():
    """
    Get wallet addresses from environment variables with balances.
    Returns wallet configuration with addresses, labels, icons, and balances.
    """
    try:
        w3 = get_web3()
        
        # Load stablecoin address from deployments
        stablecoin_address = None
        try:
            deployments = load_deployments()
            stablecoin_address = deployments.get("contracts", {}).get("ERC20Stablecoin")
        except Exception as e:
            logger.warning(f"Could not load stablecoin address: {e}")
        
        def get_balances(address: str):
            """Get ETH and stablecoin balances for an address."""
            eth_balance = w3.eth.get_balance(Web3.to_checksum_address(address))
            eth_balance_ether = w3.from_wei(eth_balance, 'ether')
            
            stablecoin_balance = 0
            if stablecoin_address:
                try:
                    # Load ERC20 ABI
                    stablecoin_abi = load_contract_abi("ERC20Stablecoin")
                    stablecoin_contract = w3.eth.contract(
                        address=Web3.to_checksum_address(stablecoin_address),
                        abi=stablecoin_abi
                    )
                    # Call balanceOf function
                    stablecoin_balance_raw = stablecoin_contract.functions.balanceOf(
                        Web3.to_checksum_address(address)
                    ).call()
                    stablecoin_balance = w3.from_wei(stablecoin_balance_raw, 'ether')
                except Exception as e:
                    logger.warning(f"Could not get stablecoin balance for {address}: {e}")
            
            return {
                "eth": float(eth_balance_ether),
                "stablecoin": float(stablecoin_balance)
            }
        
        buyer_address = get_account_address("buyer")
        seller_address = get_account_address("seller")
        carrier_address = get_account_address("carrier")
        investor_address = get_account_address("investor")
        
        wallets = {
            "buyer": {
                "address": buyer_address,
                "label": "Buyer",
                "icon": "user",
                "balance": get_balances(buyer_address)
            },
            "seller": {
                "address": seller_address,
                "label": "Seller",
                "icon": "store",
                "balance": get_balances(seller_address)
            },
            "carrier": {
                "address": carrier_address,
                "label": "Carrier",
                "icon": "truck",
                "balance": get_balances(carrier_address)
            },
            "investor": {
                "address": investor_address,
                "label": "Investor",
                "icon": "currency-dollar",
                "balance": get_balances(investor_address)
            }
        }
        
        return wallets
    except Exception as e:
        logger.error(f"Error getting wallets: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve wallets: {str(e)}"
        )


@app.post("/shipments", response_model=ShipmentResponse)
def create_shipment(shipment: ShipmentRequest):
    """
    Create a new shipment by hashing the data and calling the factory's createBoL function.
    The caller (carrier) will sign the transaction.
    """
    try:
        # Convert shipment to dict for hashing
        shipment_dict = shipment.model_dump()
        
        # Hash all the shipment data
        bol_hash_bytes = hash_shipment_data(shipment_dict)
        bol_hash_hex = Web3.to_hex(bol_hash_bytes)
        
        # Get declared value from issuingBlock
        declared_value_str = shipment.issuingBlock.declaredValue if shipment.issuingBlock else ""
        if not declared_value_str:
            raise HTTPException(
                status_code=400,
                detail="declaredValue is required in issuingBlock"
            )
        
        try:
            # Convert declared value to wei (assuming it's in base units, e.g., USDC has 6 decimals)
            # If it's already in smallest unit, use as is
            declared_value = int(declared_value_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid declaredValue: {declared_value_str}"
            )
        
        # Get blNumber from billOfLading
        bl_number = shipment.billOfLading.blNumber if shipment.billOfLading and shipment.billOfLading.blNumber else ""
        
        # Get hardcoded addresses
        shipper_address = get_account_address("seller")  # Shipper is the seller
        buyer_address = get_account_address("buyer")
        
        # Get carrier account (the one calling this API)
        carrier_account = get_account("carrier")
        
        # Load deployments to get factory address
        deployments = load_deployments()
        factory_address = deployments.get("contracts", {}).get("BillOfLadingFactory")
        
        if not factory_address:
            # Try alternative name
            factory_address = deployments.get("contracts", {}).get("TradeFactory")
        
        if not factory_address:
            raise HTTPException(
                status_code=500,
                detail="BillOfLadingFactory address not found in deployments.json"
            )
        
        # Get Web3 connection
        # In Docker, always use host.docker.internal to reach host machine
        # This ensures we can reach the host machine's Ethereum node
        if os.path.exists("/.dockerenv"):
            rpc_url = "http://host.docker.internal:8545"
            logger.info("Running in Docker, using RPC URL: http://host.docker.internal:8545")
        else:
            # Local development - use env var or default to localhost
            rpc_url = os.getenv("RPC_URL", "http://localhost:8545")
            logger.info(f"Running locally, using RPC URL: {rpc_url}")
        w3 = get_web3(rpc_url)
        
        # Call createBoL
        result = create_bol(
            w3=w3,
            account=carrier_account,
            factory_address=factory_address,
            bol_hash=bol_hash_bytes,
            declared_value=declared_value,
            shipper_address=shipper_address,
            buyer_address=buyer_address,
            bl_number=bl_number
        )
        
        if not result["bill_of_lading_address"]:
            raise HTTPException(
                status_code=500,
                detail="Failed to get BillOfLading address from transaction"
            )
        
        return ShipmentResponse(
            success=True,
            bolHash=bol_hash_hex,
            billOfLadingAddress=result["bill_of_lading_address"],
            transactionHash=result["transaction_hash"],
            message="Shipment created successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating shipment: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create shipment: {str(e)}"
        )


@app.get("/shipments/{hash}")
def get_shipment_by_hash(hash: str):
    """
    Get shipment information by BoL hash by calling getBoLByHash on the factory contract.
    Returns shipment fields including declared_value, seller, buyer, and blNumber.
    
    Example response:
    {
        "bolHash": "0x...",
        "billOfLadingAddress": "0x...",
        "buyer": "0x...",
        "seller": "0x...",
        "declaredValue": "1000000",
        "blNumber": "BL123456",
        "totalFunded": "0",
        "totalRepaid": "0",
        "settled": false,
        "claimsIssued": false,
        "fundingEnabled": false,
        "nftMinted": false
    }
    """
    try:
        # Load deployments to get factory address
        deployments = load_deployments()
        factory_address = deployments.get("contracts", {}).get("BillOfLadingFactory")
        
        if not factory_address:
            raise HTTPException(
                status_code=500,
                detail="BillOfLadingFactory address not found in deployments.json"
            )
        
        # Get Web3 connection
        # In Docker, always use host.docker.internal to reach host machine
        # This ensures we can reach the host machine's Ethereum node
        if os.path.exists("/.dockerenv"):
            rpc_url = "http://host.docker.internal:8545"
            logger.info("Running in Docker, using RPC URL: http://host.docker.internal:8545")
        else:
            # Local development - use env var or default to localhost
            rpc_url = os.getenv("RPC_URL", "http://localhost:8545")
            logger.info(f"Running locally, using RPC URL: {rpc_url}")
        w3 = get_web3(rpc_url)
        
        # Load factory ABI
        factory_abi = load_contract_abi("BillOfLadingFactory")
        factory_contract = w3.eth.contract(
            address=Web3.to_checksum_address(factory_address),
            abi=factory_abi
        )
        
        # Convert hash string to bytes32
        if hash.startswith("0x"):
            bol_hash_bytes = bytes.fromhex(hash[2:])
        else:
            bol_hash_bytes = bytes.fromhex(hash)
        
        if len(bol_hash_bytes) != 32:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid hash length. Expected 32 bytes (64 hex chars), got {len(bol_hash_bytes)} bytes"
            )
        
        # Call getBoLByHash
        exists, bill_of_lading_address = factory_contract.functions.getBoLByHash(bol_hash_bytes).call()
        
        if not exists:
            raise HTTPException(
                status_code=404,
                detail=f"Bill of Lading not found for hash: {hash}"
            )
        
        # Load BillOfLading contract ABI
        bol_abi = load_contract_abi("BillOfLading")
        bol_contract = w3.eth.contract(
            address=Web3.to_checksum_address(bill_of_lading_address),
            abi=bol_abi
        )
        
        # Get trade state
        trade_state = bol_contract.functions.getTradeState().call()
        # TradeState struct: (bolHash, buyer, seller, stablecoin, declaredValue, totalFunded, totalRepaid, settled, claimsIssued, fundingEnabled, nftMinted)
        
        # Get blNumber
        bl_number = bol_contract.functions.blNumber().call()
        
        # Build response
        return {
            "bolHash": hash,
            "billOfLadingAddress": bill_of_lading_address,
            "buyer": trade_state[1],  # buyer
            "seller": trade_state[2],  # seller (shipper)
            "declaredValue": str(trade_state[4]),  # declaredValue
            "blNumber": bl_number,
            "totalFunded": str(trade_state[5]),
            "totalRepaid": str(trade_state[6]),
            "settled": trade_state[7],
            "claimsIssued": trade_state[8],
            "fundingEnabled": trade_state[9],
            "nftMinted": trade_state[10],
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shipment by hash: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get shipment: {str(e)}"
        )


@app.get("/shipments")
def get_shipments(
    buyer: Optional[str] = Query(None, description="Filter by buyer address"),
    seller: Optional[str] = Query(None, description="Filter by seller address")
):
    """
    Query shipments from the database by buyer and/or seller address.
    Returns an array of shipments with all database fields.
    
    Example response:
    [
        {
            "id": 1,
            "bolHash": "0x...",
            "contractAddress": "0x...",
            "buyer": "0x...",
            "seller": "0x...",
            "declaredValue": "1000000",
            "blNumber": "BL123456",
            "isActive": true,
            "totalFunded": "500000",
            "totalPaid": "0",
            "totalClaimed": "0",
            "isFull": false,
            "isSettled": false,
            "createdAt": "2025-12-21T23:00:00",
            "updatedAt": "2025-12-21T23:00:00"
        }
    ]
    """
    db = SessionLocal()
    try:
        query = db.query(BillOfLadingModel)
        
        # Apply filters
        if buyer:
            query = query.filter(BillOfLadingModel.buyer == Web3.to_checksum_address(buyer))
        
        if seller:
            query = query.filter(BillOfLadingModel.seller == Web3.to_checksum_address(seller))
        
        # Execute query
        shipments = query.all()
        
        # Convert to response format with all fields
        results = []
        for shipment in shipments:
            # Compute derived fields
            declared_value_int = int(shipment.declared_value) if shipment.declared_value else 0
            total_funded_int = int(shipment.total_funded) if shipment.total_funded else 0
            total_paid_int = int(shipment.total_paid) if shipment.total_paid else 0
            total_claimed_int = int(shipment.total_claimed) if shipment.total_claimed else 0
            
            is_full = total_funded_int == declared_value_int and declared_value_int > 0
            is_settled = total_claimed_int == total_paid_int and total_paid_int > 0
            
            results.append({
                "id": shipment.id,
                "bolHash": shipment.bol_hash,
                "contractAddress": shipment.contract_address,
                "buyer": shipment.buyer,
                "seller": shipment.seller,
                "declaredValue": shipment.declared_value,
                "blNumber": shipment.bl_number,
                "isActive": shipment.is_active,
                "totalFunded": shipment.total_funded,
                "totalPaid": shipment.total_paid,
                "totalClaimed": shipment.total_claimed,
                "isFull": is_full,
                "isSettled": is_settled,
                "createdAt": shipment.created_at.isoformat() if shipment.created_at else None,
                "updatedAt": shipment.updated_at.isoformat() if shipment.updated_at else None,
            })
        
        return results
        
    except Exception as e:
        logger.error(f"Error querying shipments: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query shipments: {str(e)}"
        )
    finally:
        db.close()
