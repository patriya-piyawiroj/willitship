import sys
import os

# Add project root to python path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, Base, SessionLocal
from app.models.participant import Participant

def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # Check if data exists
    if db.query(Participant).first():
        print("Database already initialized.")
        return

    print("Seeding mock data...")
    participants = [
        # SELLERS
        Participant(
            name="TRUSTED EXPORTS LTD", country_code="VN", entity_type="SELLER",
            years_in_operation=10, kyc_status="VERIFIED", historical_claim_rate=0.01
        ),
        Participant(
            name="NEWBIE TRADERS INC", country_code="CN", entity_type="SELLER",
            years_in_operation=1, kyc_status="PENDING", historical_claim_rate=0.00
        ),
        
        # BUYERS
        Participant(
            name="GLOBAL IMPORTS LLC", country_code="US", entity_type="BUYER",
            on_time_payment_rate=0.98, kyc_status="VERIFIED"
        ),
        Participant(
            name="RISKY BUYING CO", country_code="TH", entity_type="BUYER",
            on_time_payment_rate=0.50, kyc_status="VERIFIED" # Late payments
        ),
    ]

    db.add_all(participants)
    db.commit()
    print("Success! Database initialized with mock participants.")
    db.close()

if __name__ == "__main__":
    init_db()