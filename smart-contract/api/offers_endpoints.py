"""
API endpoints for offers functionality.
These are added to main.py to avoid making it too long.
"""
from fastapi import HTTPException, Query
from sqlalchemy.orm import Session
from web3 import Web3
from eth_account import Account
from typing import List

from .models import Offer as OfferModel, BillOfLading as BillOfLadingModel
from .schemas import OfferResponse
from .blockchain import get_web3, load_contract_abi, get_account_private_key
import logging

logger = logging.getLogger(__name__)


def get_offers_endpoint(db: Session, hash: str) -> List[OfferResponse]:
    """
    Get all offers for a specific shipment (BoL hash).
    Returns both accepted and pending offers.
    """
    try:
        # Get offers for this hash
        offers = db.query(OfferModel).filter(
            OfferModel.bol_hash == hash
        ).order_by(OfferModel.created_at.desc()).all()
        
        return [
            OfferResponse(
                id=offer.id,
                bol_hash=offer.bol_hash,
                offer_id=offer.offer_id,
                investor=offer.investor,
                amount=offer.amount,
                interest_rate_bps=offer.interest_rate_bps,
                claim_tokens=offer.claim_tokens,
                accepted=offer.accepted,
                created_at=offer.created_at.isoformat(),
                updated_at=offer.updated_at.isoformat()
            )
            for offer in offers
        ]
    except Exception as e:
        logger.error(f"Error getting offers: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve offers: {str(e)}"
        )


def accept_offer_endpoint(db: Session, offer_id: int) -> dict:
    """
    Accept an offer by calling the smart contract's acceptOffer function.
    This will transfer money and mint claim tokens.
    """
    try:
        # Get offer from database
        offer = db.query(OfferModel).filter(OfferModel.offer_id == offer_id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        
        if offer.accepted:
            raise HTTPException(status_code=400, detail="Offer already accepted")
        
        # Get shipment to find contract address
        shipment = db.query(BillOfLadingModel).filter(
            BillOfLadingModel.bol_hash == offer.bol_hash
        ).first()
        
        if not shipment:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        # Get seller's private key and create account
        seller_key = get_account_private_key("seller")
        seller_account = Account.from_key(seller_key)
        w3 = get_web3()
        
        # Get contract instance
        bol_abi = load_contract_abi("BillOfLading")
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(shipment.contract_address),
            abi=bol_abi
        )
        
        # Build and send transaction
        nonce = w3.eth.get_transaction_count(seller_account.address)
        tx = contract.functions.acceptOffer(offer_id).build_transaction({
            'from': seller_account.address,
            'nonce': nonce,
            'gas': 500000,
            'gasPrice': w3.eth.gas_price
        })
        
        signed_tx = seller_account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        
        # Wait for confirmation
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        # Update offer in database (event listener will also update it, but we can mark it here)
        offer.accepted = True
        db.commit()
        
        return {
            "success": True,
            "transactionHash": receipt['transactionHash'].hex(),
            "message": "Offer accepted successfully"
        }
    except Exception as e:
        logger.error(f"Error accepting offer: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to accept offer: {str(e)}"
        )

