from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    country_code = Column(String)
    entity_type = Column(String) # 'SELLER' or 'BUYER'
    
    # Seller Specific Metrics [cite: 37, 38]
    years_in_operation = Column(Integer, default=0)
    historical_claim_rate = Column(Float, default=0.0) # 0.0 to 1.0
    
    # Buyer Specific Metrics [cite: 45]
    on_time_payment_rate = Column(Float, default=1.0) # 0.0 to 1.0
    
    # KYC [cite: 57, 59]
    kyc_status = Column(String, default="PENDING") # VERIFIED, PENDING, REJECTED

class ScoringLog(Base):
    """Audit trail for every scoring request [cite: 98]"""
    __tablename__ = "scoring_logs"

    id = Column(Integer, primary_key=True, index=True)
    transaction_ref = Column(String, index=True)
    shipper_name = Column(String)
    consignee_name = Column(String)
    final_score = Column(Integer)
    risk_band = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())