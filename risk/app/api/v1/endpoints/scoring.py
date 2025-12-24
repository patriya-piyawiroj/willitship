from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List

from app.core.database import get_db
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