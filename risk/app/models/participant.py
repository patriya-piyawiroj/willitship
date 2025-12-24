from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint('name', 'country_code', name='uix_name_country'),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    country_code = Column(String)
    entity_type = Column(String)  # 'SELLER' or 'BUYER'

    years_in_operation = Column(Integer, default=0)
    historical_claim_rate = Column(Float, default=0.0)
    on_time_payment_rate = Column(Float, default=1.0)
    kyc_status = Column(String, default="PENDING")

    # Seller Specific
    annual_revenue_teu = Column(Integer, default=0)
    bl_amendment_rate = Column(Float, default=0.0)

    # Buyer Specific
    port_consistency = Column(Float, default=1.0)
    document_dispute_rate = Column(Float, default=0.0)


class HistoricalTransaction(Base):
    """
    Represents a verified, completed shipment.
    Used to establish the 'Relationship Score'.
    """
    __tablename__ = "historical_transactions"

    id = Column(Integer, primary_key=True, index=True)
    bl_number = Column(String, unique=True, index=True)
    
    seller_id = Column(Integer, ForeignKey("participants.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("participants.id"), nullable=False)
    
    status = Column(String, default="COMPLETED")  # PENDING, COMPLETED, CANCELLED 
    completion_date = Column(DateTime(timezone=True), server_default=func.now())