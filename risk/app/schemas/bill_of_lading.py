from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List
from datetime import date


class Address(BaseModel):
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True)

    street: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = Field(default=None, alias="postalCode")


class Party(BaseModel):
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True)

    name: str = Field(..., description="Legal entity name")
    address: Optional[Address] = Field(
        default=None,
        description="Structured address of the party.",
    )


class RiskEvent(BaseModel):
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True)

    risk_type: str = Field(..., alias="riskType")
    description: str
    severity: int


class BillOfLadingInput(BaseModel):
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True)

    bl_number: str = Field(..., alias="blNumber", description="Unique B/L Reference")
    shipper: Party
    consignee: Party
    port_of_loading: str = Field(..., alias="portOfLoading")
    port_of_discharge: str = Field(..., alias="portOfDischarge")

    vessel: Optional[str] = None
    voyage_no: Optional[str] = Field(default=None, alias="voyageNo")
    gross_weight: Optional[float] = Field(default=None, alias="grossWeight")
    measurement: Optional[float] = None
    packages: Optional[int] = None
    container_seal_list: Optional[List[str]] = Field(
        default=None, alias="containerSealList"
    )

    date_of_issue: Optional[date] = Field(default=None, alias="dateOfIssue")
    shipped_on_board_date: Optional[date] = Field(
        default=None, alias="shippedOnBoardDate"
    )
    incoterm: Optional[str] = Field(default=None, description="e.g. CIF, FOB, EXW")
    freight_payment_terms: Optional[str] = Field(
        default=None,
        alias="freightPaymentTerms",
        description="e.g. FREIGHT PREPAID, FREIGHT COLLECT",
    )
    simulated_events: Optional[List[RiskEvent]] = Field(
        default=[], alias="simulatedEvents"
    )

    @field_validator("bl_number")
    def validate_bl(cls, v):
        if not v or len(v.strip()) < 3:
            raise ValueError("Invalid B/L Number")
        return v.strip().upper()
