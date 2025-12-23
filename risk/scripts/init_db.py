import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, Base, SessionLocal
from app.models.participant import Participant, ScoringLog

def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # 1. Seed Participants
    if not db.query(Participant).first():
        print("Seeding participants...")
        participants = [
            Participant(name="TRUSTED EXPORTS LTD", country_code="VN", entity_type="SELLER", years_in_operation=10, kyc_status="VERIFIED", historical_claim_rate=0.01),
            Participant(name="NEWBIE TRADERS INC", country_code="CN", entity_type="SELLER", years_in_operation=1, kyc_status="PENDING", historical_claim_rate=0.00),
            Participant(name="GLOBAL IMPORTS LLC", country_code="US", entity_type="BUYER", on_time_payment_rate=0.98, kyc_status="VERIFIED"),
            Participant(name="RISKY BUYING CO", country_code="TH", entity_type="BUYER", on_time_payment_rate=0.50, kyc_status="VERIFIED"),
        ]
        db.add_all(participants)
    
    # 2. Seed Transaction History (Scoring Logs)
    # We create fake history showing that TRUSTED EXPORTS has traded with GLOBAL IMPORTS before.
    if not db.query(ScoringLog).first():
        print("Seeding transaction history (pairing logs)...")
        logs = [
            ScoringLog(transaction_ref="HIST001", shipper_name="TRUSTED EXPORTS LTD", consignee_name="GLOBAL IMPORTS LLC", final_score=95, risk_band="LOW"),
            ScoringLog(transaction_ref="HIST002", shipper_name="TRUSTED EXPORTS LTD", consignee_name="GLOBAL IMPORTS LLC", final_score=95, risk_band="LOW"),
            ScoringLog(transaction_ref="HIST003", shipper_name="TRUSTED EXPORTS LTD", consignee_name="GLOBAL IMPORTS LLC", final_score=95, risk_band="LOW"),
        ]
        db.add_all(logs)

    db.commit()
    print("Success! Database initialized.")
    db.close()

if __name__ == "__main__":
    init_db()