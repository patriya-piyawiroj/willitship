"""
Offer-related Pydantic schemas.
"""
from pydantic import BaseModel
from typing import List


class OfferResponse(BaseModel):
    id: int
    bol_hash: str
    offer_id: int
    investor: str
    amount: str
    interest_rate_bps: int
    claim_tokens: str
    accepted: bool
    created_at: str
    updated_at: str
