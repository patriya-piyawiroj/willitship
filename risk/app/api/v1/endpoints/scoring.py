from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.core.database import get_db
from app.models.participant import ScoringLog
from app.schemas.bill_of_lading import BillOfLadingInput
from app.schemas.score import ScoringResponse, DashboardRow, DashboardStats
from app.services.risk_engine import RiskEngine

router = APIRouter()


@router.post("/", response_model=ScoringResponse)
async def create_risk_assessment(
    bl_data: BillOfLadingInput, db: Session = Depends(get_db)
):
    """
    Creates a new Credit Risk Assessment.
    """
    engine = RiskEngine(db)
    result = engine.calculate(bl_data)
    return result


# 2. LIST (New)
@router.get("/", response_model=List[DashboardRow])
async def get_dashboard_history(
    skip: int = 0, limit: int = 50, db: Session = Depends(get_db)
):
    """
    Returns the audit trail of recent transactions.
    """
    logs = (
        db.query(ScoringLog)
        .order_by(ScoringLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Map DB objects to Pydantic schema
    return [
        DashboardRow(
            id=log.id,
            transaction_ref=log.transaction_ref,
            shipper=log.raw_shipper_name,
            consignee=log.raw_consignee_name,
            score=log.final_score,
            risk_rating=log.risk_rating,
            risk_band=log.risk_band,
            created_at=log.created_at,
        )
        for log in logs
    ]


# 3. STATS (New)
@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Returns high-level KPI metrics for the dashboard.
    """
    total = db.query(func.count(ScoringLog.id)).scalar()

    # Avoid division by zero
    if total == 0:
        return DashboardStats(total_transactions=0, avg_score=0.0, high_risk_count=0)

    avg = db.query(func.avg(ScoringLog.final_score)).scalar()
    high_risk = (
        db.query(func.count(ScoringLog.id))
        .filter(ScoringLog.risk_band == "HIGH")
        .scalar()
    )

    return DashboardStats(
        total_transactions=total, avg_score=round(avg, 1), high_risk_count=high_risk
    )
