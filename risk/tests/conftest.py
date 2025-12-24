
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.models.participant import Participant

# Use in-memory SQLite for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def db():
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    session = TestingSessionLocal()
    
    # SEED DATA
    participants = [
        # Verified Seller (High Volume, Low Error)
        Participant(
            name="TRUSTED EXPORTS LTD", country_code="VN", entity_type="SELLER",
            years_in_operation=10, kyc_status="VERIFIED", historical_claim_rate=0.01,
            annual_revenue_teu=5000, bl_amendment_rate=0.02
        ),
        # Unverified / New Seller (Low Volume, High Error)
        Participant(
            name="NEWBIE TRADERS INC", country_code="CN", entity_type="SELLER",
            years_in_operation=1, kyc_status="PENDING", historical_claim_rate=0.00,
            annual_revenue_teu=5, bl_amendment_rate=0.50
        ),
        # Reliable Buyer (Consistent Port, Low Disputes)
        Participant(
            name="GLOBAL IMPORTS LLC", country_code="US", entity_type="BUYER",
            on_time_payment_rate=0.98, kyc_status="VERIFIED",
            port_consistency=0.95, document_dispute_rate=0.01
        ),
        # Risky Buyer (Erratic Port, High Disputes)
        Participant(
            name="RISKY BUYING CO", country_code="TH", entity_type="BUYER",
            on_time_payment_rate=0.50, kyc_status="VERIFIED",
            port_consistency=0.20, document_dispute_rate=0.30
        ),
    ]
    session.add_all(participants)
    session.commit()
    
    yield session
    
    session.close()
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="module")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
