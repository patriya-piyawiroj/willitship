from pydantic import BaseModel
from typing import List
from datetime import datetime

class ScoreComponent(BaseModel):
    type: str
    score: float
    reasons: List[str]

class ScoringResponse(BaseModel):
    transaction_ref: str
    overall_score: int
    
    risk_rating: str
    risk_rating_reasoning: str  # <--- NEW FIELD
    
    risk_band: str
    event_penalty: int = 0
    breakdown: List[ScoreComponent]

class DashboardRow(BaseModel):
    id: int
    transaction_ref: str
    shipper: str
    consignee: str
    score: int
    risk_rating: str
    risk_band: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_transactions: int
    avg_score: float
    high_risk_count: int