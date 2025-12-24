from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date


class Party(BaseModel):
    name: str = Field(..., description="Legal entity name")
    address: Optional[dict] = Field(
        default=None,
        description="The address exactly as it appears on the Bill of Lading party block.",
    )


class RiskEvent(BaseModel):
    type: str
    description: str
    severity: int


class BillOfLadingInput(BaseModel):
    blNumber: str = Field(..., description="Unique B/L Reference")
    shipper: Party
    consignee: Party
    portOfLoading: str
    portOfDischarge: str
    dateOfIssue: Optional[date] = None
    shippedOnBoardDate: Optional[date] = None
    incoterm: Optional[str] = Field(default=None, description="e.g. CIF, FOB, EXW")
    freightPaymentTerms: Optional[str] = Field(
        default=None, description="e.g. FREIGHT PREPAID, FREIGHT COLLECT"
    )
    simulated_events: Optional[List[RiskEvent]] = []

    @field_validator("blNumber")
    def validate_bl(cls, v):
        if not v or len(v.strip()) < 3:
            raise ValueError("Invalid B/L Number")
        return v.strip().upper()
