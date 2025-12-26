"""
Offers service - handles offer-related endpoints.
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException

from .schemas import OfferResponse
from .offers_endpoints import get_offers_endpoint, accept_offer_endpoint

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=List[OfferResponse])
def get_offers(hash: str = None):
    """
    Get all offers for a specific shipment (BoL hash).
    Returns both accepted and pending offers.
    """
    try:
        from .database import SessionLocal
        db = SessionLocal()
        try:
            return get_offers_endpoint(db, hash)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error getting offers: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get offers: {str(e)}"
        )


@router.post("/{offer_id}/accept")
def accept_offer(offer_id: int):
    """
    Accept an offer by calling the smart contract's acceptOffer function.
    This will transfer money and mint claim tokens.
    """
    try:
        from .database import SessionLocal
        db = SessionLocal()
        try:
            return accept_offer_endpoint(db, offer_id)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error accepting offer: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to accept offer: {str(e)}"
        )
