from sqlalchemy import Column, Integer, String, Float, DateTime, func
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Participant(Base):
    __tablename__ = "participants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    country_code = Column(String)
    entity_type = Column(String)  # SELLER, BUYER
    years_in_operation = Column(Integer)
    kyc_status = Column(String)
    historical_claim_rate = Column(Float)


class ScoringLog(Base):
    __tablename__ = "scoring_logs"
    id = Column(Integer, primary_key=True)
    transaction_ref = Column(String)
    final_score = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
