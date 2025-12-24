import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, Base, SessionLocal
from app.models.participant import Participant, HistoricalTransaction


def init_db():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    # 1. Seed Participants
    if not db.query(Participant).first():
        print("Seeding participants...")
        participants = [
            Participant(
                name="TRUSTED EXPORTS LTD",
                country_code="VN",
                entity_type="SELLER",
                years_in_operation=10,
                kyc_status="VERIFIED",
                historical_claim_rate=0.01,
                annual_revenue_teu=5000,
                bl_amendment_rate=0.02,
            ),
            Participant(
                name="NEWBIE TRADERS INC",
                country_code="CN",
                entity_type="SELLER",
                years_in_operation=1,
                kyc_status="PENDING",
                historical_claim_rate=0.00,
                annual_revenue_teu=5,
                bl_amendment_rate=0.50,
            ),
            Participant(
                name="GLOBAL IMPORTS LLC",
                country_code="US",
                entity_type="BUYER",
                on_time_payment_rate=0.98,
                kyc_status="VERIFIED",
                port_consistency=0.95,
                document_dispute_rate=0.01,
            ),
            Participant(
                name="RISKY BUYING CO",
                country_code="TH",
                entity_type="BUYER",
                on_time_payment_rate=0.50,
                kyc_status="VERIFIED",
                port_consistency=0.20,
                document_dispute_rate=0.30,
            ),
        ]
        db.add_all(participants)
        db.commit()

    # 2. Seed Historical Transactions (Verified Trades)
    if not db.query(HistoricalTransaction).first():
        print("Seeding verified trade history...")
        
        seller = db.query(Participant).filter_by(name="TRUSTED EXPORTS LTD").first()
        buyer = db.query(Participant).filter_by(name="GLOBAL IMPORTS LLC").first()
        
        if seller and buyer:
            history = [
                HistoricalTransaction(
                    bl_number="OLD-VERIFIED-001",
                    seller_id=seller.id,
                    buyer_id=buyer.id,
                    status="COMPLETED"
                ),
                HistoricalTransaction(
                    bl_number="OLD-VERIFIED-002",
                    seller_id=seller.id,
                    buyer_id=buyer.id,
                    status="COMPLETED"
                )
            ]
            db.add_all(history)
            db.commit()

    print("Success! Database initialized.")
    db.close()


if __name__ == "__main__":
    init_db()