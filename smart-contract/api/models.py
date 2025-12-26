"""
Database models for storing bill of lading information.
"""
from sqlalchemy import Column, String, Integer, BigInteger, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()


class BillOfLading(Base):
    """Table for storing bill of lading information and state."""
    __tablename__ = "bill_of_ladings"
    
    id = Column(Integer, primary_key=True, index=True)
    bol_hash = Column(String(66), nullable=False, unique=True, index=True)  # The hash used for getBoLByHash
    contract_address = Column(String(42), nullable=False, index=True)  # BillOfLading contract address
    buyer_wallet = Column(String(42), nullable=False, index=True)  # Buyer wallet address
    seller_wallet = Column(String(42), nullable=False, index=True)  # Seller wallet address
    declared_value = Column(String(78), nullable=False)  # Store as string, convert to float4 when querying
    bl_number = Column(String(255), nullable=True, index=True)
    
    # Extracted names for easy access
    carrier = Column(String(255), nullable=True, index=True)  # From billOfLading.carrierName
    seller = Column(String(255), nullable=True, index=True)  # From shipper.name (shipper = seller)
    buyer = Column(String(255), nullable=True, index=True)  # From consignee.name
    
    # PDF URL from GCS
    pdf_url = Column(String(500), nullable=True)  # URL to the uploaded eBL PDF/image in GCS
    
    # State fields (updated by different events)
    is_active = Column(Boolean, default=False, nullable=False)  # True = active (funding enabled), False = inactive (funding disabled)
    total_funded = Column(String(78), default="0", nullable=False)  # Updated by Funded events
    total_paid = Column(String(78), default="0", nullable=False)  # Updated by Paid events (totalRepaid in contract)
    total_claimed = Column(String(78), default="0", nullable=False)  # Updated by Claimed events
    settled = Column(Boolean, default=False, nullable=False)  # True when trade is settled
    
    # Date fields for tracking when each status was reached
    minted_at = Column(DateTime(timezone=True), nullable=True)  # When BoL was minted (Created event)
    funding_enabled_at = Column(DateTime(timezone=True), nullable=True)  # When funding was enabled (Active event)
    arrived_at = Column(DateTime(timezone=True), nullable=True)  # When shipment arrived (Inactive event)
    paid_at = Column(DateTime(timezone=True), nullable=True)  # When buyer paid (Paid event)
    settled_at = Column(DateTime(timezone=True), nullable=True)  # When trade was settled (Settled event)
    
    # Note: is_full can be derived by checking if total_funded == declared_value
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Offer(Base):
    """Table for storing funding offers."""
    __tablename__ = "offers"
    
    id = Column(Integer, primary_key=True, index=True)
    bol_hash = Column(String(66), nullable=False, index=True)
    offer_id = Column(BigInteger, nullable=False)  # The offerId from the contract
    investor = Column(String(42), nullable=False, index=True)
    amount = Column(String(78), nullable=False)  # Amount to fund (actual payment)
    interest_rate_bps = Column(BigInteger, nullable=False)  # Interest rate in basis points
    claim_tokens = Column(String(78), nullable=False)  # Claim tokens to be issued (amount + interest)
    accepted = Column(Boolean, default=False, nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        {'extend_existing': True},
    )

