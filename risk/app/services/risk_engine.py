from sqlalchemy.orm import Session
from app.models.participant import Participant, ScoringLog
from app.schemas.bill_of_lading import BillOfLadingInput

class RiskEngine:
    def __init__(self, db: Session):
        self.db = db
        # Weights from Spec Section 6.1 [cite: 50]
        self.W_SELLER = 0.35
        self.W_BUYER = 0.45
        self.W_TXN = 0.20
        
        # Simple high-risk port list for demo
        self.HIGH_RISK_PORTS = ["BANDAR ABBAS", "SEVASTOPOL", "PYONGYANG"]

    def _get_participant(self, name: str, role: str) -> Participant:
        return self.db.query(Participant).filter(
            Participant.name == name, 
            Participant.entity_type == role
        ).first()

    def _score_seller(self, name: str) -> (float, list[str]):
        """Calculates Seller Score (SS) [cite: 56, 57]"""
        score = 100.0
        reasons = []
        seller = self._get_participant(name, "SELLER")

        if not seller:
            return 50.0, ["Unknown Seller: No history in database (Neutral Risk)."]

        # Rule: KYC (25 pts weight in theory, mapped to simple deduction here)
        if seller.kyc_status != "VERIFIED":
            score -= 30
            reasons.append("Seller KYC not verified (-30).")
        
        # Rule: Operational History [cite: 57]
        if seller.years_in_operation < 2:
            score -= 20
            reasons.append(f"New Seller: Only {seller.years_in_operation} years operation (-20).")
        else:
            reasons.append(f"Established Seller ({seller.years_in_operation} years).")

        # Rule: Claims History [cite: 57]
        if seller.historical_claim_rate > 0.05:
            score -= 30
            reasons.append(f"High Claim Rate: {seller.historical_claim_rate*100}% (-30).")

        return max(0.0, score), reasons

    def _score_buyer(self, name: str) -> (float, list[str]):
        """Calculates Buyer Score (BS) [cite: 58, 59]"""
        score = 100.0
        reasons = []
        buyer = self._get_participant(name, "BUYER")

        if not buyer:
            return 50.0, ["Unknown Buyer: No credit history (Neutral Risk)."]

        # Rule: Payment Behavior [cite: 59]
        if buyer.on_time_payment_rate < 0.80:
            deduction = (1.0 - buyer.on_time_payment_rate) * 100
            score -= deduction
            reasons.append(f"Poor Payment History: {int(buyer.on_time_payment_rate*100)}% on-time (-{int(deduction)}).")
        
        # Rule: KYC
        if buyer.kyc_status != "VERIFIED":
            score -= 30
            reasons.append("Buyer KYC not verified (-30).")

        return max(0.0, score), reasons

    def _score_transaction(self, bl: BillOfLadingInput) -> (float, list[str]):
        """Calculates Transaction Score (TS) [cite: 60, 61]"""
        score = 100.0
        reasons = []

        # Rule: Route Risk / Sanctions [cite: 61]
        route = f"{bl.portOfLoading} -> {bl.portOfDischarge}"
        if any(p in route.upper() for p in self.HIGH_RISK_PORTS):
            return 0.0, [f"CRITICAL: Route includes high-risk port ({route})."]

        # Rule: Document Consistency [cite: 61]
        if not bl.dateOfIssue:
            score -= 10
            reasons.append("Missing Issue Date (-10).")
        
        # Consistency Check: Issue Date vs Shipped on Board
        if bl.dateOfIssue and bl.shippedOnBoardDate:
            if bl.dateOfIssue > bl.shippedOnBoardDate:
                score -= 20
                reasons.append("Invalid Dates: Issue Date is after Shipped Date (-20).")

        if score == 100.0:
            reasons.append("Transaction route and documents appear standard.")

        return max(0.0, score), reasons

    def calculate(self, bl: BillOfLadingInput):
        # 1. Calculate Sub-scores
        s_score, s_reasons = self._score_seller(bl.shipper.name)
        b_score, b_reasons = self._score_buyer(bl.consignee.name)
        t_score, t_reasons = self._score_transaction(bl)

        # 2. Weighted Formula [cite: 52]
        overall = (s_score * self.W_SELLER) + (b_score * self.W_BUYER) + (t_score * self.W_TXN)
        overall = int(overall)

        # 3. Risk Band [cite: 55]
        if overall >= 80:
            band = "LOW"
        elif overall >= 60:
            band = "MEDIUM"
        else:
            band = "HIGH"

        # 4. Audit Log
        log = ScoringLog(
            transaction_ref=bl.blNumber,
            shipper_name=bl.shipper.name,
            consignee_name=bl.consignee.name,
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