from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date


class Address(BaseModel):
    street: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


class Party(BaseModel):
    name: str = Field(..., description="Legal entity name")
    address: Optional[Address] = Field(
        default=None,
        description="Structured address of the party.",
    )


class RiskEvent(BaseModel):
    risk_type: str
    description: str
    severity: int


class BillOfLadingInput(BaseModel):
    blNumber: str = Field(..., description="Unique B/L Reference")
    shipper: Party
    consignee: Party
    portOfLoading: str
    portOfDischarge: str
    
    vessel: Optional[str] = None
    voyageNo: Optional[str] = None
    grossWeight: Optional[float] = None
    measurement: Optional[float] = None
    packages: Optional[int] = None
    containerSealList: Optional[List[str]] = None

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