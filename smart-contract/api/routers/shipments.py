"""
Shipment service - handles all shipment-related endpoints.
"""
import logging
import hashlib
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse

from ..schemas.shipment import ShipmentRequest, ShipmentResponse
from ..models.bill_of_lading import BillOfLading as BillOfLadingModel
from ..core.blockchain import get_account_address
from ..core.storage import upload_file_to_gcs

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_shipment_file(
    file: UploadFile = File(...),
    bol_hash: Optional[str] = Query(None, description="BoL hash to check in database and use as filename")
):
    """
    Upload a PDF file to Google Cloud Storage.
    Calculates file hash and uses it as the filename.
    If bol_hash is provided, checks database first to see if shipment already exists.
    Returns the public URL of the uploaded file.
    """
    try:
        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="No file provided"
            )

        file_content = await file.read()
        
        # Calculate hash of file content (SHA-256)
        file_hash = hashlib.sha256(file_content).hexdigest()
        file_name = f"{file_hash}.pdf"
        
        # If bol_hash is provided, check database first
        if bol_hash:
            from ..core.database import SessionLocal
            db = SessionLocal()
            try:
                existing_shipment = db.query(BillOfLadingModel).filter_by(bol_hash=bol_hash).first()
                if existing_shipment and existing_shipment.pdf_url:
                    logger.info(f"Shipment with bol_hash {bol_hash} already exists with PDF URL: {existing_shipment.pdf_url}")
                    db.close()
                    # Return 409 Conflict with existing PDF URL
                    return JSONResponse(
                        status_code=409,
                        content={
                            "success": False,
                            "message": "Shipment with this bol_hash already exists",
                            "pdfUrl": existing_shipment.pdf_url,
                            "bolHash": bol_hash,
                            "alreadyExists": True
                        }
                    )
            finally:
                db.close()
        
        pdf_url = upload_file_to_gcs(
            file_content=file_content,
            file_name=file_name,
            content_type=file.content_type
        )
        logger.info(f"Uploaded eBL file to GCS: {pdf_url} (file hash: {file_hash})")

        return {
            "success": True,
            "pdfUrl": pdf_url,
            "fileHash": file_hash,
            "message": "File uploaded successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file to GCS: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file to GCS: {str(e)}"
        )


@router.post("", response_model=ShipmentResponse)
async def create_shipment(
    shipment: ShipmentRequest
):
    """
    Save a shipment record to the database.
    The shipment should already be created on the blockchain by the frontend.
    Accepts JSON body with shipment data, bolHash, contractAddress, and optional pdfUrl.
    """
    try:
        # Extract required fields from frontend
        bol_hash_hex = shipment.bolHash
        contract_address = shipment.contractAddress
        pdf_url = shipment.pdfUrl

        if not bol_hash_hex:
            raise HTTPException(
                status_code=400,
                detail="bolHash is required (should be set by frontend)"
            )

        if not contract_address:
            raise HTTPException(
                status_code=400,
                detail="contractAddress is required (should be set by frontend)"
            )

        # Get shipment data for processing
        shipment_dict = shipment.model_dump(exclude_none=False)

        # Get declared value and convert to wei for storage
        declared_value_str = shipment.issuingBlock.declaredValue if shipment.issuingBlock and hasattr(shipment.issuingBlock, 'declaredValue') else ""
        if not declared_value_str:
            declared_value_str = shipment_dict.get("issuingBlock", {}).get("declaredValue", "") if isinstance(shipment_dict.get("issuingBlock"), dict) else ""

        try:
            declared_value_float = float(declared_value_str) if declared_value_str else 0
            declared_value = str(int(declared_value_float * (10 ** 18)))  # Store as wei string
        except (ValueError, TypeError):
            declared_value = "0"

        # Get BL number
        bl_number = shipment.billOfLading.blNumber if shipment.billOfLading and hasattr(shipment.billOfLading, 'blNumber') else ""
        if not bl_number:
            bl_number = shipment_dict.get("billOfLading", {}).get("blNumber", "") if isinstance(shipment_dict.get("billOfLading"), dict) else ""

        # Get wallet addresses
        buyer_address = get_account_address("buyer")
        shipper_address = get_account_address("seller")

        # Extract data from shipment
        carrier_name = ""
        seller_name = ""
        buyer_name = ""
        place_of_receipt = ""
        place_of_delivery = ""

        try:
            # Extract data from billOfLading
            bill_of_lading_obj = shipment_dict.get("billOfLading", {})
            if isinstance(bill_of_lading_obj, dict):
                carrier_name = bill_of_lading_obj.get("carrierName", "").strip()
                place_of_receipt = bill_of_lading_obj.get("placeOfReceipt", "").strip()
                place_of_delivery = bill_of_lading_obj.get("placeOfDelivery", "").strip()

            # Extract seller name from shipper.name (shipper = seller)
            shipper_obj = shipment_dict.get("shipper", {})
            if isinstance(shipper_obj, dict):
                seller_name = shipper_obj.get("name", "").strip()

            # Extract buyer name from consignee.name
            consignee_obj = shipment_dict.get("consignee", {})
            if isinstance(consignee_obj, dict):
                buyer_name = consignee_obj.get("name", "").strip()

            logger.info(f"Extracted data - carrier: '{carrier_name}', seller: '{seller_name}', buyer: '{buyer_name}', receipt: '{place_of_receipt}', delivery: '{place_of_delivery}'")
        except Exception as e:
            logger.error(f"Error extracting names: {e}", exc_info=True)

        # Save to database
        from ..core.database import SessionLocal
        db = SessionLocal()
        try:
            # Check if record already exists
            bol_record = db.query(BillOfLadingModel).filter_by(bol_hash=bol_hash_hex).first()

            if not bol_record:
                # Create the record with data from frontend
                logger.info(f"💾 Saving BoL record to database: {bol_hash_hex}")
                bol_record = BillOfLadingModel(
                    bol_hash=bol_hash_hex,
                    contract_address=contract_address,
                    buyer_wallet=buyer_address,
                    seller_wallet=shipper_address,
                    declared_value=declared_value,
                    bl_number=bl_number,
                    carrier=carrier_name if carrier_name else None,
                    seller=seller_name if seller_name else None,
                    buyer=buyer_name if buyer_name else None,
                    place_of_receipt=place_of_receipt if place_of_receipt else None,
                    place_of_delivery=place_of_delivery if place_of_delivery else None,
                    pdf_url=pdf_url,
                    minted_at=datetime.utcnow()
                )
                db.add(bol_record)
                db.commit()
                logger.info(f"✅ Saved BoL record to database: {bol_hash_hex}")
            else:
                logger.warning(f"BoL record already exists for hash: {bol_hash_hex}")

        except Exception as e:
            logger.error(f"Error saving shipment data: {e}", exc_info=True)
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save shipment data: {str(e)}"
            )
        finally:
            db.close()

        return ShipmentResponse(
            success=True,
            bolHash=bol_hash_hex,
            billOfLadingAddress=contract_address,
            transactionHash="",  # Transaction already happened on frontend
            message="Shipment saved successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving shipment: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save shipment: {str(e)}"
        )


@router.get("/{hash}")
async def get_shipment_by_hash(hash: str):
    """
    Get shipment details by BoL hash.
    First tries to get data from database, falls back to blockchain if not found.
    """
    try:
        from ..core.database import SessionLocal, wei_to_tokens
        from ..core.blockchain import get_web3, load_deployments, load_contract_abi
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
        from ..core.database import SessionLocal, wei_to_tokens
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
