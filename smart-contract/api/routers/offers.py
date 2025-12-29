"""
Offers service - handles offer-related endpoints.
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from ..schemas.offer import OfferResponse
from ..models.bill_of_lading import Offer as OfferModel

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=List[OfferResponse])
def get_offers(hash: str = None):
    """
    Get all offers for a specific shipment (BoL hash).
    Returns both accepted and pending offers.
    """
    try:
        from ..core.database import SessionLocal
        db = SessionLocal()
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
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error getting offers: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get offers: {str(e)}"
        )


