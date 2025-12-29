"""
Wallet-related Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional


class WalletBalance(BaseModel):
    eth: float
    stablecoin: float


class WalletInfo(BaseModel):
    address: str
    label: str
    icon: str
    balance: WalletBalance
