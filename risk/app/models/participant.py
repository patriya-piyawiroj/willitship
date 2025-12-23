from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    country_code = Column(String)
    entity_type = Column(String) # 'SELLER' or 'BUYER'
    
    # Metrics
    years_in_operation = Column(Integer, default=0)
    historical_claim_rate = Column(Float, default=0.0) 
    on_time_payment_rate = Column(Float, default=1.0) 
    kyc_status = Column(String, default="PENDING")

class ScoringLog(Base):
    __tablename__ = "scoring_logs"

    id = Column(Integer, primary_key=True, index=True)
    transaction_ref = Column(String, index=True)
    
    # Audit Fields (Raw Text)
    raw_shipper_name = Column(String)
    raw_consignee_name = Column(String)
    
    # Linked IDs (Nullable for unknown entities)
    seller_id = Column(Integer, ForeignKey("participants.id"), nullable=True)
    buyer_id = Column(Integer, ForeignKey("participants.id"), nullable=True)

    final_score = Column(Integer)
    risk_band = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Optional ORM relationships
    seller = relationship("Participant", foreign_keys=[seller_id])
    buyer = relationship("Participant", foreign_keys=[buyer_id])