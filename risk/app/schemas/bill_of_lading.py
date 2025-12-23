from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date

class Party(BaseModel):
    name: str = Field(..., description="Legal entity name")
    address: Optional[dict] = Field(default=None, description="Raw address object or string")

class BillOfLadingInput(BaseModel):
    blNumber: str = Field(..., description="Unique B/L Reference")
    shipper: Party
    consignee: Party
    portOfLoading: str
    portOfDischarge: str
    
    # Optional fields used for validation/consistency checks [cite: 25]
    dateOfIssue: Optional[date] = None
    shippedOnBoardDate: Optional[date] = None
    
    # Fields present in input but excluded from score calculation per user instruction
    goods_description: Optional[str] = None
    grossWeight: Optional[float] = None

    @field_validator('blNumber')
    def validate_bl(cls, v):
        if not v or len(v.strip()) < 3:
            raise ValueError("Invalid B/L Number")
        return v.strip().upper()