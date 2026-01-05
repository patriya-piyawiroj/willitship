"""
Pydantic schemas for API requests and responses.
"""
from pydantic import BaseModel
from typing import Optional


class Address(BaseModel):
    street: Optional[str] = ""
    country: Optional[str] = ""


class Shipper(BaseModel):
    name: Optional[str] = ""
    address: Optional[Address] = Address()


class Consignee(BaseModel):
    name: Optional[str] = ""
    blType: Optional[str] = ""
    toOrderOfText: Optional[str] = ""


class NotifyParty(BaseModel):
    name: Optional[str] = ""
    note: Optional[str] = ""


class BillOfLading(BaseModel):
    blNumber: Optional[str] = ""
    scac: Optional[str] = ""
    carrierName: Optional[str] = ""
    onwardInlandRouting: Optional[str] = ""
    vessel: Optional[str] = ""
    voyageNo: Optional[str] = ""
    portOfLoading: Optional[str] = ""
    portOfDischarge: Optional[str] = ""
    placeOfReceipt: Optional[str] = ""
    placeOfDelivery: Optional[str] = ""


class IssuingBlock(BaseModel):
    carriersReceipt: Optional[str] = ""
    placeOfIssue: Optional[str] = ""
    numberOfOriginalBL: Optional[str] = ""
    dateOfIssue: Optional[str] = ""
    declaredValue: Optional[str] = ""
    shippedOnBoardDate: Optional[str] = ""
    issuerSignature: Optional[str] = ""


class ShipmentRequest(BaseModel):
    shipper: Optional[Shipper] = Shipper()
    consignee: Optional[Consignee] = Consignee()
    notifyParty: Optional[NotifyParty] = NotifyParty()
    billOfLading: Optional[BillOfLading] = BillOfLading()
    issuingBlock: Optional[IssuingBlock] = IssuingBlock()


class ShipmentResponse(BaseModel):
    success: bool
    bolHash: str
    billOfLadingAddress: str
    transactionHash: str
    message: Optional[str] = None

