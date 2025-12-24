from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.participant import Participant, ScoringLog
from app.schemas.bill_of_lading import BillOfLadingInput

class RiskEngine:
    def __init__(self, db: Session):
        self.db = db
        self.W_SELLER = 0.35
        self.W_BUYER = 0.45
        self.W_TXN = 0.20
        self.HIGH_RISK_PORTS = ["BANDAR ABBAS", "SEVASTOPOL", "PYONGYANG"]

    def _get_participant(self, name: str, role: str) -> Participant:
        return self.db.query(Participant).filter(Participant.name == name, Participant.entity_type == role).first()

    def _get_pairing_history(self, shipper_name: str, consignee_name: str) -> int:
        count = self.db.query(func.count(ScoringLog.id)).filter(
            ScoringLog.raw_shipper_name == shipper_name, ScoringLog.raw_consignee_name == consignee_name
        ).scalar()
        return count if count else 0

    def _score_seller(self, name: str) -> (float, list[str]):
        score = 100.0
        reasons = []
        seller = self._get_participant(name, "SELLER")
        if not seller: return 50.0, ["Unknown Seller"]
        if seller.kyc_status != "VERIFIED": score -= 30; reasons.append("Seller KYC Pending")
        if seller.years_in_operation < 2: score -= 20; reasons.append("New Seller (<2 yrs)")
        if seller.historical_claim_rate > 0.05: score -= 30; reasons.append("High Claim Rate")
        return max(0.0, score), reasons

    def _score_buyer(self, name: str) -> (float, list[str]):
        score = 100.0
        reasons = []
        buyer = self._get_participant(name, "BUYER")
        if not buyer: return 50.0, ["Unknown Buyer"]
        if buyer.on_time_payment_rate < 0.80: score -= int((1.0-buyer.on_time_payment_rate)*100); reasons.append("Poor Payment History")
        if buyer.kyc_status != "VERIFIED": score -= 30; reasons.append("Buyer KYC Pending")
        return max(0.0, score), reasons

    def _score_transaction(self, bl: BillOfLadingInput) -> (float, list[str]):
        score = 100.0
        reasons = []
        route = f"{bl.portOfLoading} -> {bl.portOfDischarge}"
        if any(p in route.upper() for p in self.HIGH_RISK_PORTS): return 0.0, ["CRITICAL: Sanctioned Port"]
        
        past_trades = self._get_pairing_history(bl.shipper.name, bl.consignee.name)
        if past_trades == 0: score -= 20; reasons.append("First-time pairing (-20)")
        else: reasons.append(f"Established Relationship ({past_trades} trades)")
        
        if not bl.dateOfIssue: score -= 10; reasons.append("Missing Issue Date")
        elif bl.shippedOnBoardDate and bl.dateOfIssue > bl.shippedOnBoardDate: score -= 20; reasons.append("Invalid Dates")
        return max(0.0, score), reasons

    def calculate(self, bl: BillOfLadingInput):
        # 1. Base Calculation
        s_score, s_reasons = self._score_seller(bl.shipper.name)
        b_score, b_reasons = self._score_buyer(bl.consignee.name)
        t_score, t_reasons = self._score_transaction(bl)

        base_score = (s_score * self.W_SELLER) + (b_score * self.W_BUYER) + (t_score * self.W_TXN)
        
        # 2. NEW: Bonus / Penalty Module (Event Scoring)
        event_penalty = 0
        event_logs = []
        
        if bl.simulated_events:
            for event in bl.simulated_events:
                # Severity is usually negative (e.g. -15), so we add it
                event_penalty += event.severity 
                event_logs.append(f"{event.type}: {event.description} ({event.severity})")
                
                # Add to Transaction Reasons for visibility
                t_reasons.append(f"EVENT: {event.description} ({event.severity})")

        # Apply penalty (Ensure score stays 0-100)
        final_score = int(base_score + event_penalty)
        final_score = max(0, min(100, final_score))

        # 3. Determine Risk Band
        if final_score >= 80: band = "LOW"
        elif final_score >= 60: band = "MEDIUM"
        else: band = "HIGH"

        # 4. Save to DB
        seller = self._get_participant(bl.shipper.name, "SELLER")
        buyer = self._get_participant(bl.consignee.name, "BUYER")

        log = ScoringLog(
            transaction_ref=bl.blNumber,
            raw_shipper_name=bl.shipper.name,
            raw_consignee_name=bl.consignee.name,
            seller_id=seller.id if seller else None,
            buyer_id=buyer.id if buyer else None,
            final_score=final_score,
            risk_band=band,
            events_summary=" | ".join(event_logs) if event_logs else None
        )
        self.db.add(log)
        self.db.commit()

        return {
            "transaction_ref": bl.blNumber,
            "overall_score": final_score,
            "risk_band": band,
            "event_penalty": event_penalty,
            "breakdown": [
                {"type": "Seller Score", "score": s_score, "reasons": s_reasons},
                {"type": "Buyer Score", "score": b_score, "reasons": b_reasons},
                {"type": "Transaction Score", "score": t_score, "reasons": t_reasons},
            ]
        }