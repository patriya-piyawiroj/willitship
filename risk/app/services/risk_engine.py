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
        return self.db.query(Participant).filter(
            Participant.name == name, 
            Participant.entity_type == role
        ).first()

    def _get_pairing_history(self, shipper_name: str, consignee_name: str) -> int:
        """
        Counts how many times this specific pair has traded before.
        Logic based on Spec Section 6.6 (Counterparty Pairing).
        """
        count = self.db.query(func.count(ScoringLog.id)).filter(
            ScoringLog.shipper_name == shipper_name,
            ScoringLog.consignee_name == consignee_name
        ).scalar()
        return count

    def _score_seller(self, name: str) -> (float, list[str]):
        # ... (Same as before) ...
        score = 100.0
        reasons = []
        seller = self._get_participant(name, "SELLER")
        
        if not seller:
            return 50.0, ["Unknown Seller: No history found."]

        if seller.kyc_status != "VERIFIED":
            score -= 30
            reasons.append("Seller KYC not verified (-30).")
        
        if seller.years_in_operation < 2:
            score -= 20
            reasons.append(f"New Seller: Only {seller.years_in_operation} years operation (-20).")
        
        if seller.historical_claim_rate > 0.05:
            score -= 30
            reasons.append(f"High Claim Rate: {seller.historical_claim_rate*100}% (-30).")

        return max(0.0, score), reasons

    def _score_buyer(self, name: str) -> (float, list[str]):
        # ... (Same as before) ...
        score = 100.0
        reasons = []
        buyer = self._get_participant(name, "BUYER")

        if not buyer:
            return 50.0, ["Unknown Buyer: No history found."]

        if buyer.on_time_payment_rate < 0.80:
            deduction = (1.0 - buyer.on_time_payment_rate) * 100
            score -= deduction
            reasons.append(f"Poor Payment History: {int(buyer.on_time_payment_rate*100)}% on-time (-{int(deduction)}).")
        
        if buyer.kyc_status != "VERIFIED":
            score -= 30
            reasons.append("Buyer KYC not verified (-30).")

        return max(0.0, score), reasons

    def _score_transaction(self, bl: BillOfLadingInput) -> (float, list[str]):
        """Calculates Transaction Score (TS)"""
        score = 100.0
        reasons = []

        # 1. CRITICAL CHECK: Sanctions (Spec Sec 6.6 - Route Risk)
        route = f"{bl.portOfLoading} -> {bl.portOfDischarge}"
        if any(p in route.upper() for p in self.HIGH_RISK_PORTS):
            return 0.0, [f"CRITICAL: Route includes high-risk port ({route})."]

        # 2. PAIRING CHECK: Relationship History (Spec Sec 6.6 - Counterparty pairing)
        # We query the audit log to see if they traded before
        past_trades = self._get_pairing_history(bl.shipper.name, bl.consignee.name)
        
        if past_trades == 0:
            score -= 20
            reasons.append("First-time pairing between Seller and Buyer (-20).")
        else:
            reasons.append(f"Established Relationship: {past_trades} prior trades found (+0).")

        # 3. DOCUMENT CHECK: Consistency
        if not bl.dateOfIssue:
            score -= 10
            reasons.append("Missing Issue Date (-10).")
        
        if bl.dateOfIssue and bl.shippedOnBoardDate:
            if bl.dateOfIssue > bl.shippedOnBoardDate:
                score -= 20
                reasons.append("Invalid Dates: Issue Date is after Shipped Date (-20).")

        return max(0.0, score), reasons

    def calculate(self, bl: BillOfLadingInput):
        # 1. Calculate Sub-scores (Existing logic)
        s_score, s_reasons = self._score_seller(bl.shipper.name)
        b_score, b_reasons = self._score_buyer(bl.consignee.name)
        t_score, t_reasons = self._score_transaction(bl)

        # 2. Weighted Formula
        overall = (s_score * self.W_SELLER) + (b_score * self.W_BUYER) + (t_score * self.W_TXN)
        overall = int(overall)

        # 3. Risk Band
        if overall >= 80:
            band = "LOW"
        elif overall >= 60:
            band = "MEDIUM"
        else:
            band = "HIGH"

        # 4. FETCH IDs FOR AUDIT LOG (New Step)
        # We need the actual DB IDs to create the Foreign Key links
        seller = self._get_participant(bl.shipper.name, "SELLER")
        buyer = self._get_participant(bl.consignee.name, "BUYER")

        # 5. Log with IDs and Raw Names (Updated Schema)
        log = ScoringLog(
            transaction_ref=bl.blNumber,
            
            # Audit the raw text from the B/L
            raw_shipper_name=bl.shipper.name,
            raw_consignee_name=bl.consignee.name,
            
            # Link to the Entities (if they exist)
            seller_id=seller.id if seller else None,
            buyer_id=buyer.id if buyer else None,
            
            final_score=overall,
            risk_band=band
        )
        self.db.add(log)
        self.db.commit()

        return {
            "transaction_ref": bl.blNumber,
            "overall_score": overall,
            "risk_band": band,
            "breakdown": [
                {"type": "Seller Score", "score": s_score, "reasons": s_reasons},
                {"type": "Buyer Score", "score": b_score, "reasons": b_reasons},
                {"type": "Transaction Score", "score": t_score, "reasons": t_reasons},
            ]
        }