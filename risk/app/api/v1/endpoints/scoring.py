from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List

from app.core.database import get_db
from app.schemas.bill_of_lading import BillOfLadingInput
from app.schemas.score import ScoringResponse, DashboardRow, DashboardStats
from app.services.risk_engine import RiskEngine
from app.models.participant import ScoringLog

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
        .limit(min(limit, 100))  # Security cap
        .all()
    )

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


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Returns high-level KPI metrics for the dashboard.
    """
    stats = db.query(
        func.count(ScoringLog.id).label("total"),
        func.avg(ScoringLog.final_score).label("avg_score"),
        func.sum(case((ScoringLog.risk_band == "HIGH", 1), else_=0)).label("high_risk"),
    ).first()

    return DashboardStats(
        total_transactions=stats.total or 0,
        avg_score=round(stats.avg_score or 0.0, 1),
        high_risk_count=stats.high_risk or 0,
    )
