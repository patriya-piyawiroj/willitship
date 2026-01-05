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
from .models import BillOfLading as BillOfLadingModel, ShipmentDetails as ShipmentDetailsModel
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
            # Convert declared value from human-readable format (e.g., "100") to wei
            # Stablecoin uses 18 decimals (standard ERC20), so multiply by 10^18
            # Example: "100" -> 100 * 10^18 = 100000000000000000000
            declared_value_float = float(declared_value_str)
            declared_value = int(declared_value_float * (10 ** 18))
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid declaredValue: {declared_value_str}. Must be a number."
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
        

        # Create ShipmentDetails record
        # Extract fields from nested Pydantic models with safeguards
        shipment_details = ShipmentDetailsModel(
            bol_hash=bol_hash_hex,
            
            # Logistics
            vessel=shipment.billOfLading.vessel if shipment.billOfLading else None,
            voyage_no=shipment.billOfLading.voyageNo if shipment.billOfLading else None,
            port_of_loading=shipment.billOfLading.portOfLoading if shipment.billOfLading else None,
            port_of_discharge=shipment.billOfLading.portOfDischarge if shipment.billOfLading else None,
            place_of_receipt=shipment.billOfLading.placeOfReceipt if shipment.billOfLading else None,
            place_of_delivery=shipment.billOfLading.placeOfDelivery if shipment.billOfLading else None,
            
            # Cargo (using simple JSON dumps for lists if needed, but currently simple fields)
            goods_description=None, # Not explicitly in current BillOfLading schema, adding placeholder
            package_count=None, # Not explicitly in current BillOfLading schema
            
            # Financials
            freight_payment_terms=None, # In Financials block of OCR but not yet in ShipmentRequest schema
            
            # Dates
            shipped_on_board_date=shipment.issuingBlock.shippedOnBoardDate if shipment.issuingBlock else None,
            date_of_issue=shipment.issuingBlock.dateOfIssue if shipment.issuingBlock else None
        )
        
        # Save to DB
        db = SessionLocal()
        try:
            db.add(shipment_details)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to save shipment details to DB: {e}")
            # Don't fail the request, as contract interaction succeeded
        finally:
            db.close()

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
    Get shipment information by BoL hash using a two-step process:
    
    Step 1: Query Factory Contract (Registry Lookup)
    - Calls factory.getBoLByHash(hash) to get the BillOfLading contract address
    - Factory acts as a registry mapping hash -> contract address
    
    Step 2: Query BillOfLading Contract (State Retrieval)
    - Calls bolContract.getTradeState() to get detailed state
    - This is the source of truth for all shipment data
    
    This two-step approach is standard practice in factory pattern contracts.
    The factory is the registry, individual contracts hold the state.
    
    Returns shipment fields including declared_value, seller, buyer, and blNumber.
    
    Example response:
    {
        "bolHash": "0x...",
        "billOfLadingAddress": "0x...",
        "contractAddress": "0x...",
        "buyer": "0x...",
        "seller": "0x...",
        "declaredValue": "1000000",
        "blNumber": "BL123456",
        "totalFunded": "0",
        "totalRepaid": "0",
        "totalPaid": "0",
        "settled": false,
        "claimsIssued": false,
        "fundingEnabled": false,
        "nftMinted": false,
        "isActive": false,
        "isFull": false,
        "isSettled": false
    }
    """
    try:
        # ============================================================
        # STEP 1: FACTORY LOOKUP - Get BillOfLading Contract Address
        # ============================================================
        # The factory contract acts as a registry mapping BoL hash -> contract address
        # This is a simple lookup, not state retrieval
        
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
        
        # Load factory ABI and create contract instance
        factory_abi = load_contract_abi("BillOfLadingFactory")
        factory_contract = w3.eth.contract(
            address=Web3.to_checksum_address(factory_address),
            abi=factory_abi
        )
        
        # Convert hash string to bytes32 for contract call
        if hash.startswith("0x"):
            bol_hash_bytes = bytes.fromhex(hash[2:])
        else:
            bol_hash_bytes = bytes.fromhex(hash)
        
        if len(bol_hash_bytes) != 32:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid hash length. Expected 32 bytes (64 hex chars), got {len(bol_hash_bytes)} bytes"
            )
        
        # Helper function to convert wei to tokens
        def wei_to_tokens(wei_str):
            try:
                wei_value = float(wei_str) if isinstance(wei_str, str) else float(wei_str)
                return str(wei_value / (10 ** 18))
            except (ValueError, TypeError):
                return "0"
        
        # STEP 1: Call factory.getBoLByHash() - Registry lookup
        # Returns: (bool exists, address billOfLadingAddress)
        try:
            exists, bill_of_lading_address = factory_contract.functions.getBoLByHash(bol_hash_bytes).call()
        except Exception as e:
            # If contract call fails (e.g., hash doesn't exist, contract not deployed, etc.)
            # Fall back to database lookup
            logger.warning(f"Contract call failed for hash {hash}: {e}. Falling back to database lookup.")
            exists = False
            bill_of_lading_address = None
        
        if not exists:
            # Try to get from database as fallback
            db = SessionLocal()
            try:
                shipment = db.query(BillOfLadingModel).filter(BillOfLadingModel.bol_hash == hash).first()
                if shipment:
                    # Return database data (may not have real-time contract state)
                    is_full = float(shipment.total_funded) >= float(shipment.declared_value) if shipment.total_funded and shipment.declared_value else False
                    is_settled = float(shipment.total_claimed) >= float(shipment.total_paid) and float(shipment.total_paid) > 0 if shipment.total_claimed and shipment.total_paid else False
                    
                    return {
                        "bolHash": shipment.bol_hash,
                        "billOfLadingAddress": shipment.contract_address,
                        "contractAddress": shipment.contract_address,
                        "buyer": shipment.buyer,
                        "seller": shipment.seller,
                        "declaredValue": wei_to_tokens(shipment.declared_value),
                        "blNumber": shipment.bl_number,
                        "totalFunded": wei_to_tokens(shipment.total_funded),
                        "totalPaid": wei_to_tokens(shipment.total_paid),
                        "totalClaimed": wei_to_tokens(shipment.total_claimed),
                        "isActive": shipment.is_active,
                        "isFull": is_full,
                        "isSettled": is_settled,
                        "settled": is_settled,
                        "claimsIssued": shipment.is_active,  # Approximate
                        "fundingEnabled": shipment.is_active,
                        "nftMinted": True,  # Assume minted if in database
                    }
            finally:
                db.close()
            
            raise HTTPException(
                status_code=404,
                detail=f"Bill of Lading not found for hash: {hash}"
            )
        
        # ============================================================
        # STEP 2: STATE RETRIEVAL - Get Detailed State from Contract
        # ============================================================
        # Now that we have the contract address, query the actual state
        # This is the source of truth for all shipment information
        
        # Load BillOfLading contract ABI and create contract instance
        bol_abi = load_contract_abi("BillOfLading")
        bol_contract = w3.eth.contract(
            address=Web3.to_checksum_address(bill_of_lading_address),
            abi=bol_abi
        )
        
        # STEP 2: Call bolContract.getTradeState() - State retrieval
        # Returns TradeState struct with all shipment data
        # TradeState struct fields:
        #   [0] bolHash: bytes32
        #   [1] buyer: address
        #   [2] seller: address
        #   [3] stablecoin: address
        #   [4] declaredValue: uint256
        #   [5] totalFunded: uint256
        #   [6] totalRepaid: uint256
        #   [7] settled: bool
        #   [8] claimsIssued: bool
        #   [9] fundingEnabled: bool
        #   [10] nftMinted: bool
        trade_state = bol_contract.functions.getTradeState().call()
        
        # Get blNumber (stored as separate public variable)
        bl_number = bol_contract.functions.blNumber().call()
        
        # Calculate derived fields
        declared_value_int = int(trade_state[4])
        total_funded_int = int(trade_state[5])
        total_repaid_int = int(trade_state[6])
        
        is_full = total_funded_int == declared_value_int and declared_value_int > 0
        is_settled = trade_state[7]  # settled field from contract
        
        # Build response with all fields
        return {
            "bolHash": hash,
            "billOfLadingAddress": bill_of_lading_address,
            "contractAddress": bill_of_lading_address,  # Alias for frontend compatibility
            "buyer": trade_state[1],  # buyer address
            "seller": trade_state[2],  # seller (shipper) address
            # Convert from wei to human-readable tokens (18 decimals)
            "declaredValue": str(float(trade_state[4]) / (10 ** 18)),  # Convert wei to tokens
            "blNumber": bl_number,
            "totalFunded": str(float(trade_state[5]) / (10 ** 18)),  # Convert wei to tokens
            "totalRepaid": str(float(trade_state[6]) / (10 ** 18)),  # Convert wei to tokens
            "totalPaid": str(float(trade_state[6]) / (10 ** 18)),  # Alias: totalRepaid = totalPaid
            "settled": trade_state[7],  # settled boolean
            "claimsIssued": trade_state[8],  # claimsIssued boolean
            "fundingEnabled": trade_state[9],  # fundingEnabled boolean
            "nftMinted": trade_state[10],  # nftMinted boolean
            # Derived fields for frontend compatibility
            "isActive": trade_state[9],  # fundingEnabled = isActive
            "isFull": is_full,  # calculated: totalFunded == declaredValue
            "isSettled": is_settled,  # alias for settled
        }
        
        # ============================================================
        # STEP 3: ENRICH WITH DB DETAILS (Logistics)
        # ============================================================
        db = SessionLocal()
        try:
            details = db.query(ShipmentDetailsModel).filter(ShipmentDetailsModel.bol_hash == hash).first()
            if details:
                response_data["logistics"] = {
                    "vessel": details.vessel,
                    "voyageNo": details.voyage_no,
                    "portOfLoading": details.port_of_loading,
                    "portOfDischarge": details.port_of_discharge,
                    "placeOfReceipt": details.place_of_receipt,
                    "placeOfDelivery": details.place_of_delivery,
                    "shippedOnBoardDate": details.shipped_on_board_date,
                    "dateOfIssue": details.date_of_issue
                }
        except Exception as e:
            logger.warning(f"Failed to fetch detailed logistics for {hash}: {e}")
        finally:
            db.close()
            
        return response_data
        
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
            
            # Convert from wei to human-readable tokens (18 decimals)
            def wei_to_tokens(wei_str):
                try:
                    wei_value = float(wei_str) if isinstance(wei_str, str) else float(wei_str)
                    return str(wei_value / (10 ** 18))
                except (ValueError, TypeError):
                    return "0"
            
            results.append({
                "id": shipment.id,
                "bolHash": shipment.bol_hash,
                "contractAddress": shipment.contract_address,
                "buyer": shipment.buyer,
                "seller": shipment.seller,
                "declaredValue": wei_to_tokens(shipment.declared_value),
                "blNumber": shipment.bl_number,
                "isActive": shipment.is_active,
                "totalFunded": wei_to_tokens(shipment.total_funded),
                "totalPaid": wei_to_tokens(shipment.total_paid),
                "totalClaimed": wei_to_tokens(shipment.total_claimed),
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
