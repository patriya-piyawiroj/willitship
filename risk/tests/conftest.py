
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
        # Verified Seller
        Participant(
            name="TRUSTED EXPORTS LTD", country_code="VN", entity_type="SELLER",
            years_in_operation=10, kyc_status="VERIFIED", historical_claim_rate=0.01
        ),
        # Unverified / New Seller
        Participant(
            name="NEWBIE TRADERS INC", country_code="CN", entity_type="SELLER",
            years_in_operation=1, kyc_status="PENDING", historical_claim_rate=0.00
        ),
        # Reliable Buyer
        Participant(
            name="GLOBAL IMPORTS LLC", country_code="US", entity_type="BUYER",
            on_time_payment_rate=0.98, kyc_status="VERIFIED"
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
