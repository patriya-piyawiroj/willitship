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
    buyer = Column(String(42), nullable=False, index=True)
    seller = Column(String(42), nullable=False, index=True)
    declared_value = Column(String(78), nullable=False)  # Store as string, convert to float4 when querying
    bl_number = Column(String(255), nullable=True, index=True)
    
    # State fields (updated by different events)
    is_active = Column(Boolean, default=False, nullable=False)  # True = active (funding enabled), False = inactive (funding disabled)
    total_funded = Column(String(78), default="0", nullable=False)  # Updated by Funded events
    total_paid = Column(String(78), default="0", nullable=False)  # Updated by Paid events (totalRepaid in contract)
    total_claimed = Column(String(78), default="0", nullable=False)  # Updated by Claimed events
    # Note: is_full can be derived by checking if total_funded == declared_value
    # Note: is_settled can be derived by checking if total_claimed == total_paid
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

