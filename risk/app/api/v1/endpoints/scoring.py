from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.bill_of_lading import BillOfLadingInput
from app.schemas.score import ScoringResponse
from app.services.risk_engine import RiskEngine

router = APIRouter()

@router.post("/analyze", response_model=ScoringResponse)
async def analyze_bl(
    bl_data: BillOfLadingInput, 
    db: Session = Depends(get_db)
):
    """
    Analyzes B/L data against database history and returns a weighted risk score.
    """
    engine = RiskEngine(db)
    result = engine.calculate(bl_data)
    return result