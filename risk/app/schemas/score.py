from pydantic import BaseModel
from typing import List

class ScoreComponent(BaseModel):
    type: str       # Seller, Buyer, Transaction
    score: float    # 0-100
    reasons: List[str]

class ScoringResponse(BaseModel):
    transaction_ref: str
    overall_score: int
    risk_band: str  # LOW, MEDIUM, HIGH
    breakdown: List[ScoreComponent]