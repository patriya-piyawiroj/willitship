"""
Shipment service - handles all shipment-related endpoints.
"""
import json
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from sqlalchemy.orm import Session
from web3 import Web3

from .schemas import ShipmentRequest, ShipmentResponse
from .models import BillOfLading as BillOfLadingModel
from .blockchain import (
    get_web3,
    get_account,
    get_account_address,
    load_deployments,
    hash_shipment_data,
    create_bol,
)
from .gcs_upload import upload_file_to_gcs

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_shipment_file(
    file: UploadFile = File(...)
):
    """
    Upload a PDF file to Google Cloud Storage.
    Returns the public URL of the uploaded file.
    """
    try:
        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="No file provided"
            )

        file_content = await file.read()
        pdf_url = upload_file_to_gcs(
            file_content=file_content,
            file_name=file.filename,
            content_type=file.content_type
        )
        logger.info(f"Uploaded eBL file to GCS: {pdf_url}")

        return {
            "success": True,
            "pdfUrl": pdf_url,
            "message": "File uploaded successfully"
        }
    except Exception as e:
        logger.error(f"Error uploading file to GCS: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file to GCS: {str(e)}"
        )


@router.post("", response_model=ShipmentResponse)
async def create_shipment(
    shipment: ShipmentRequest,
    pdfUrl: Optional[str] = Body(None, description="Optional PDF URL from /shipments/upload endpoint")
):
    """
    Create a new shipment by hashing the data and calling the factory's createBoL function.
    The caller (carrier) will sign the transaction.
    Accepts JSON body with shipment data and optional pdfUrl (from /shipments/upload endpoint).
    """
    try:
        # Extract pdfUrl from shipment object
        pdf_url = shipment.pdfUrl

        # Convert shipment to dict for hashing (use model_dump to ensure consistent structure)
        shipment_dict = shipment.model_dump(exclude_none=False)
        if pdf_url:
            shipment_dict["pdf_url"] = pdf_url

        # Get original shipment dict for name extraction
        original_shipment_dict = shipment.model_dump(exclude_none=False)

        # Hash all the shipment data (including pdf_url if present)
        bol_hash_bytes = hash_shipment_data(shipment_dict)
        bol_hash_hex = Web3.to_hex(bol_hash_bytes)

        # Get declared value from issuingBlock
        declared_value_str = shipment.issuingBlock.declaredValue if shipment.issuingBlock and hasattr(shipment.issuingBlock, 'declaredValue') else ""
        if not declared_value_str:
            # Try to get from shipment_dict as fallback
            declared_value_str = shipment_dict.get("issuingBlock", {}).get("declaredValue", "") if isinstance(shipment_dict.get("issuingBlock"), dict) else ""
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
        bl_number = shipment.billOfLading.blNumber if shipment.billOfLading and hasattr(shipment.billOfLading, 'blNumber') else ""
        if not bl_number:
            # Try to get from shipment_dict as fallback
            bl_number = shipment_dict.get("billOfLading", {}).get("blNumber", "") if isinstance(shipment_dict.get("billOfLading"), dict) else ""

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

        # Save to database - create complete record with all information
        from .database import SessionLocal
        db = SessionLocal()
        try:
            # Check if record already exists (created by event listener)
            bol_record = db.query(BillOfLadingModel).filter_by(bol_hash=bol_hash_hex).first()

            if not bol_record:
                # Extract names from shipment data
                carrier_name = ""
                seller_name = ""
                buyer_name = ""

                try:
                    logger.debug(f"Extracting names from shipment data")

                    # Extract carrier name from billOfLading.carrierName
                    bill_of_lading_obj = original_shipment_dict.get("billOfLading", {})
                    if isinstance(bill_of_lading_obj, dict):
                        carrier_name = bill_of_lading_obj.get("carrierName", "").strip()

                    # Extract seller name from shipper.name (shipper = seller)
                    shipper_obj = original_shipment_dict.get("shipper", {})
                    if isinstance(shipper_obj, dict):
                        seller_name = shipper_obj.get("name", "").strip()

                    # Extract buyer name from consignee.name
                    consignee_obj = original_shipment_dict.get("consignee", {})
                    if isinstance(consignee_obj, dict):
                        buyer_name = consignee_obj.get("name", "").strip()

                    logger.info(f"Extracted names - carrier: '{carrier_name}', seller: '{seller_name}', buyer: '{buyer_name}'")
                except Exception as e:
                    logger.error(f"Error extracting names: {e}", exc_info=True)

                # Create the complete record with all information at once
                logger.info(f"🏗️ Creating complete BoL record: {bol_hash_hex}")
                bol_record = BillOfLadingModel(
                    bol_hash=bol_hash_hex,
                    contract_address=result["bill_of_lading_address"],
                    buyer_wallet=buyer_address,
                    seller_wallet=shipper_address,
                    declared_value=str(declared_value),
                    bl_number=bl_number,
                    carrier=carrier_name if carrier_name else None,
                    seller=seller_name if seller_name else None,
                    buyer=buyer_name if buyer_name else None,
                    pdf_url=pdf_url,
                    minted_at=datetime.utcnow()
                )
                db.add(bol_record)
                db.commit()
                logger.info(f"✅ Created complete BoL record in database: {bol_hash_hex}")
            else:
                logger.warning(f"BoL record already exists for hash: {bol_hash_hex} (created by event listener)")
        except Exception as e:
            logger.error(f"Error saving form data: {e}", exc_info=True)
            db.rollback()
        finally:
            db.close()

        return ShipmentResponse(
            success=True,
            bolHash=bol_hash_hex,
            billOfLadingAddress=result["bill_of_lading_address"],
            transactionHash=result["transaction_hash"],
            message="Shipment created successfully"
        )

    except Exception as e:
        logger.error(f"Error creating shipment: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create shipment: {str(e)}"
        )


@router.get("/{hash}")
async def get_shipment_by_hash(hash: str):
    """
    Get shipment details by BoL hash.
    First tries to get data from database, falls back to blockchain if not found.
    """
    try:
        from .database import SessionLocal, wei_to_tokens
        from .blockchain import get_web3, load_deployments, load_contract_abi
        db = SessionLocal()
        try:
            shipment = db.query(BillOfLadingModel).filter_by(bol_hash=hash).first()

            if shipment:
                # Return data from database
                return {
                    "bolHash": shipment.bol_hash,
                    "billOfLadingAddress": shipment.contract_address,
                    "contractAddress": shipment.contract_address,
                    "buyer": shipment.buyer_wallet,  # Wallet address
                    "seller": shipment.seller_wallet,  # Wallet address
                    "declaredValue": wei_to_tokens(shipment.declared_value),
                    "blNumber": shipment.bl_number,
                    "carrierName": shipment.carrier or "N/A",  # Name
                    "sellerName": shipment.seller or "N/A",  # Name
                    "buyerName": shipment.buyer or "N/A",  # Name
                    "placeOfReceipt": shipment.place_of_receipt or "N/A",
                    "placeOfDelivery": shipment.place_of_delivery or "N/A",
                    "pdfUrl": shipment.pdf_url if hasattr(shipment, 'pdf_url') and shipment.pdf_url else None,
                    "isActive": shipment.is_active,
                    "fundingEnabled": shipment.funding_enabled if hasattr(shipment, 'funding_enabled') else False,
                    "totalFunded": wei_to_tokens(shipment.total_funded),
                    "totalPaid": wei_to_tokens(shipment.total_paid),
                    "totalClaimed": wei_to_tokens(shipment.total_claimed),
                    "claimsIssued": shipment.claims_issued if hasattr(shipment, 'claims_issued') else False,
                    "settled": shipment.settled if hasattr(shipment, 'settled') else False,
                    "isFull": False,  # Will be calculated below
                    "isSettled": shipment.settled if hasattr(shipment, 'settled') else False,
                    "mintedAt": shipment.minted_at.isoformat() if hasattr(shipment, 'minted_at') and shipment.minted_at else None,
                    "fundingEnabledAt": shipment.funding_enabled_at.isoformat() if hasattr(shipment, 'funding_enabled_at') and shipment.funding_enabled_at else None,
                    "arrivedAt": shipment.arrived_at.isoformat() if hasattr(shipment, 'arrived_at') and shipment.arrived_at else None,
                    "paidAt": shipment.paid_at.isoformat() if hasattr(shipment, 'paid_at') and shipment.paid_at else None,
                    "settledAt": shipment.settled_at.isoformat() if hasattr(shipment, 'settled_at') and shipment.settled_at else None,
                    "createdAt": shipment.created_at.isoformat() if shipment.created_at else None,
                    "updatedAt": shipment.updated_at.isoformat() if shipment.updated_at else None,
                }

            # Fallback to blockchain lookup
            deployments = load_deployments()
            bol_address = deployments.get("contracts", {}).get("BillOfLading")

            if not bol_address:
                raise HTTPException(
                    status_code=404,
                    detail="BillOfLading contract address not found"
                )

            w3 = get_web3()
            contract = w3.eth.contract(
                address=w3.to_checksum_address(bol_address),
                abi=load_contract_abi("BillOfLading")
            )

            # Call getBoLByHash
            try:
                bol_data = contract.functions.getBoLByHash(w3.to_bytes(hexstr=hash)).call()
            except Exception as e:
                raise HTTPException(
                    status_code=404,
                    detail=f"Shipment with hash {hash} not found"
                )

            # Parse the returned data (adjust indices based on contract structure)
            trade_state = bol_data[1]  # Assuming trade state is at index 1
            bl_number = bol_data[2] if len(bol_data) > 2 else ""

            # Get contract address for this specific BoL
            bill_of_lading_address = bol_data[0] if bol_data[0] != "0x0000000000000000000000000000000000000000" else bol_address

            # Get trade state from the specific BoL contract
            bol_contract = w3.eth.contract(
                address=w3.to_checksum_address(bill_of_lading_address),
                abi=load_contract_abi("BillOfLading")
            )
            trade_state = bol_contract.functions.getTradeState().call()

            # Calculate derived values
            declared_value = float(trade_state[4]) / (10 ** 18) if trade_state[4] else 0
            total_funded = float(trade_state[5]) / (10 ** 18) if trade_state[5] else 0
            total_paid = float(trade_state[6]) / (10 ** 18) if trade_state[6] else 0
            total_repaid = float(trade_state[7]) / (10 ** 18) if trade_state[7] else 0

            is_full = total_funded >= declared_value if declared_value > 0 else False
            is_settled = trade_state[8] if len(trade_state) > 8 else False

            return {
                "bolHash": hash,
                "billOfLadingAddress": bill_of_lading_address,
                "contractAddress": bill_of_lading_address,  # Alias for frontend compatibility
                "buyer": trade_state[1],  # buyer wallet address
                "seller": trade_state[2],  # seller wallet address
                "declaredValue": str(declared_value),
                "blNumber": bl_number,
                "carrierName": shipment.carrier or "N/A",  # Name from DB
                "sellerName": shipment.seller or "N/A",  # Name from DB
                "buyerName": shipment.buyer or "N/A",  # Name from DB
                "placeOfReceipt": shipment.place_of_receipt or "N/A",
                "placeOfDelivery": shipment.place_of_delivery or "N/A",
                "pdfUrl": shipment.pdf_url if hasattr(shipment, 'pdf_url') and shipment.pdf_url else None,
                "isActive": trade_state[10],  # fundingEnabled boolean
                "fundingEnabled": trade_state[10],  # fundingEnabled boolean
                "totalFunded": str(total_funded),  # totalFunded (claim tokens with interest)
                "totalPaid": str(total_paid),  # Actual stablecoin payments to seller
                "totalRepaid": str(total_repaid),  # Stablecoin paid by buyer
                "claimsIssued": trade_state[9],  # claimsIssued boolean
                "settled": trade_state[8],  # settled boolean
                "nftMinted": trade_state[11] if len(trade_state) > 11 else False,  # nftMinted boolean
                "isFull": is_full,
                "isSettled": is_settled,
                "mintedAt": shipment.minted_at.isoformat() if hasattr(shipment, 'minted_at') and shipment.minted_at else None,
                "fundingEnabledAt": shipment.funding_enabled_at.isoformat() if hasattr(shipment, 'funding_enabled_at') and shipment.funding_enabled_at else None,
                "arrivedAt": shipment.arrived_at.isoformat() if hasattr(shipment, 'arrived_at') and shipment.arrived_at else None,
                "paidAt": shipment.paid_at.isoformat() if hasattr(shipment, 'paid_at') and shipment.paid_at else None,
                "settledAt": shipment.settled_at.isoformat() if hasattr(shipment, 'settled_at') and shipment.settled_at else None,
                "createdAt": shipment.created_at.isoformat() if shipment.created_at else None,
                "updatedAt": shipment.updated_at.isoformat() if shipment.updated_at else None,
            }

        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shipment by hash: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get shipment: {str(e)}"
        )


@router.get("")
async def get_shipments():
    """
    Get all shipments from the database.
    Returns shipments with database data enriched with blockchain state.
    """
    try:
        from .database import SessionLocal, wei_to_tokens
        db = SessionLocal()
        try:
            shipments = db.query(BillOfLadingModel).order_by(BillOfLadingModel.created_at.desc()).all()

            results = []
            for shipment in shipments:
                # Calculate derived values
                declared_value = wei_to_tokens(shipment.declared_value)
                total_funded = wei_to_tokens(shipment.total_funded)
                is_full = total_funded >= declared_value if declared_value > 0 else False
                is_settled = shipment.settled if hasattr(shipment, 'settled') else False

                results.append({
                    "id": shipment.id,
                    "bolHash": shipment.bol_hash,
                    "contractAddress": shipment.contract_address,
                    "buyer": shipment.buyer_wallet,  # Wallet address
                    "seller": shipment.seller_wallet,  # Wallet address
                    "declaredValue": declared_value,
                    "blNumber": shipment.bl_number,
                    "shipperName": shipment.seller or "N/A",  # Name from DB (seller is shipper)
                    "sellerName": shipment.seller or "N/A",  # Name from DB
                    "carrierName": shipment.carrier or "N/A",  # Name from DB
                    "buyerName": shipment.buyer or "N/A",  # Name from DB
                    "placeOfReceipt": shipment.place_of_receipt or "N/A",
                    "placeOfDelivery": shipment.place_of_delivery or "N/A",
                    "pdfUrl": shipment.pdf_url if hasattr(shipment, 'pdf_url') and shipment.pdf_url else None,
                    "isActive": shipment.is_active,
                    "fundingEnabled": shipment.funding_enabled if hasattr(shipment, 'funding_enabled') else False,
                    "totalFunded": total_funded,
                    "totalPaid": wei_to_tokens(shipment.total_paid),
                    "totalClaimed": wei_to_tokens(shipment.total_claimed),
                    "claimsIssued": shipment.claims_issued if hasattr(shipment, 'claims_issued') else False,
                    "settled": is_settled,
                    "isFull": is_full,
                    "isSettled": is_settled,
                    "mintedAt": shipment.minted_at.isoformat() if hasattr(shipment, 'minted_at') and shipment.minted_at else None,
                    "fundingEnabledAt": shipment.funding_enabled_at.isoformat() if hasattr(shipment, 'funding_enabled_at') and shipment.funding_enabled_at else None,
                    "arrivedAt": shipment.arrived_at.isoformat() if hasattr(shipment, 'arrived_at') and shipment.arrived_at else None,
                    "paidAt": shipment.paid_at.isoformat() if hasattr(shipment, 'paid_at') and shipment.paid_at else None,
                    "settledAt": shipment.settled_at.isoformat() if hasattr(shipment, 'settled_at') and shipment.settled_at else None,
                    "createdAt": shipment.created_at.isoformat() if shipment.created_at else None,
                    "updatedAt": shipment.updated_at.isoformat() if shipment.updated_at else None,
                })

            return results

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error getting shipments: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get shipments: {str(e)}"
        )
