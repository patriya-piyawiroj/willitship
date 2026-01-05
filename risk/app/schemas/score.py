from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List
from datetime import datetime


class ScoreComponent(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )

    score_type: str
    score: float
    reasons: List[str]


class ScoringResponse(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )

    transaction_ref: str
    overall_score: int

    risk_rating: str
    risk_rating_reasoning: str

    risk_band: str
    event_penalty: int = 0
    breakdown: List[ScoreComponent]


class DashboardRow(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        from_attributes=True,
    )

    id: int
    transaction_ref: str
    shipper: str
    consignee: str
    score: int
    risk_rating: str
    risk_band: str
    created_at: datetime


class DashboardStats(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True
    )

    total_transactions: int
    avg_score: float
    high_risk_count: int
