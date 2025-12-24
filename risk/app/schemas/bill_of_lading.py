from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date

class Party(BaseModel):
    name: str = Field(..., description="Legal entity name")
    address: Optional[dict] = Field(default=None, description="Raw address object or string")

class RiskEvent(BaseModel):
    type: str = Field(..., description="WEATHER, POLITICAL, OPERATIONAL")
    description: str = Field(..., description="e.g., Typhoon Warning in Shanghai")
    severity: int = Field(..., description="Score impact, usually negative (e.g. -15)")

class BillOfLadingInput(BaseModel):
    blNumber: str = Field(..., description="Unique B/L Reference")
    shipper: Party
    consignee: Party
    portOfLoading: str
    portOfDischarge: str
    dateOfIssue: Optional[date] = None
    shippedOnBoardDate: Optional[date] = None
    
    # NEW: Optional list to simulate real-world shocks
    simulated_events: Optional[List[RiskEvent]] = []

    @field_validator('blNumber')
    def validate_bl(cls, v):
        if not v or len(v.strip()) < 3:
            raise ValueError("Invalid B/L Number")
        return v.strip().upper()