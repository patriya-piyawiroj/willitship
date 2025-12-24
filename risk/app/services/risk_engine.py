from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.participant import Participant, ScoringLog

# CHANGED: Import from the renamed file
from app.schemas.bill_of_lading import BillOfLadingInput


class RiskEngine:
    def __init__(self, db: Session):
        self.db = db
        self.W_SELLER = 0.35
        self.W_BUYER = 0.45
        self.W_TXN = 0.20
        self.HIGH_RISK_PORTS = ["BANDAR ABBAS", "SEVASTOPOL", "PYONGYANG"]

        self.SELLER_PAYS_FREIGHT = ["CIF", "CFR", "DDP", "CIP", "CPT", "DAT", "DAP"]
        self.BUYER_PAYS_FREIGHT = ["FOB", "EXW", "FCA", "FAS"]

    def _get_participant(self, name: str, role: str) -> Participant:
        return (
            self.db.query(Participant)
            .filter(Participant.name == name, Participant.entity_type == role)
            .first()
        )

    def _get_pairing_history(self, shipper_name: str, consignee_name: str) -> int:
        count = (
            self.db.query(func.count(ScoringLog.id))
            .filter(
                ScoringLog.raw_shipper_name == shipper_name,
                ScoringLog.raw_consignee_name == consignee_name,
            )
            .scalar()
        )
        return count if count else 0

    # ... inside RiskEngine class ...

    def _score_seller(self, name: str) -> (float, list[str]):
        """Calculates Seller Score (SS) with Granular Metrics"""
        score = 100.0
        reasons = []
        seller = self._get_participant(name, "SELLER")

        if not seller:
            return 50.0, ["Unknown Seller: No history found."]

        # 1. KYC Check (Existing)
        if seller.kyc_status != "VERIFIED":
            score -= 30
            reasons.append("Seller KYC not verified (-30).")

        # 2. Operational History (Existing)
        if seller.years_in_operation < 2:
            score -= 20
            reasons.append(
                f"New Seller: Only {seller.years_in_operation} years operation (-20)."
            )

        # 3. Claims History (Existing)
        if seller.historical_claim_rate > 0.05:
            score -= 20
            reasons.append(
                f"High Claim Rate: {seller.historical_claim_rate*100}% (-20)."
            )

        # --- NEW METRICS ---

        # 4. Trade Footprint (Volume Bonus)
        # Spec 6.4: High volume indicates reliability
        if seller.annual_revenue_teu > 1000:
            # We don't add to 100, but we can offset other penalties
            # Or treat it as a buffer. Let's say it prevents score dropping too low.
            reasons.append(f"High Volume Seller ({seller.annual_revenue_teu} TEU/yr).")
        elif seller.annual_revenue_teu < 10:
            score -= 10
            reasons.append("Low Volume / Inactive Seller (-10).")

        # 5. Operational Competence (Amendment Rate)
        # Spec 6.4: Frequent amendments = incompetence
        if seller.bl_amendment_rate > 0.20:
            score -= 15
            reasons.append(
                f"High Documentation Error Rate: {int(seller.bl_amendment_rate*100)}% (-15)."
            )

        return max(0.0, score), reasons

    def _score_buyer(self, name: str) -> (float, list[str]):
        """Calculates Buyer Score (BS) with Granular Metrics"""
        score = 100.0
        reasons = []
        buyer = self._get_participant(name, "BUYER")

        if not buyer:
            return 50.0, ["Unknown Buyer: No history found."]

        # 1. Payment Behavior (Existing - The most critical metric)
        if buyer.on_time_payment_rate < 0.80:
            deduction = (1.0 - buyer.on_time_payment_rate) * 100
            score -= deduction
            reasons.append(
                f"Poor Payment History: {int(buyer.on_time_payment_rate*100)}% on-time (-{int(deduction)})."
            )

        # 2. KYC (Existing)
        if buyer.kyc_status != "VERIFIED":
            score -= 30
            reasons.append("Buyer KYC not verified (-30).")

        # 3. Receiving Footprint (Port Consistency)
        # Spec 6.5: Shell companies jump around; legit buyers have warehouses.
        if buyer.port_consistency < 0.50:
            score -= 15
            reasons.append("Erratic Port Usage: Destination varies wildly (-15).")

        # 4. Document Discipline (Dispute Rate)
        # Spec 6.5: Rejecting docs to delay payment is a bad sign.
        if buyer.document_dispute_rate > 0.10:
            score -= 20
            reasons.append(
                f"Litigious Buyer: Disputes {int(buyer.document_dispute_rate*100)}% of docs (-20)."
            )

        return max(0.0, score), reasons

    def _score_transaction(self, bl: BillOfLadingInput) -> (float, list[str]):
        score = 100.0
        reasons = []

        # 1. SANCTIONS (Route Risk)
        route = f"{bl.portOfLoading} -> {bl.portOfDischarge}"
        if any(p in route.upper() for p in self.HIGH_RISK_PORTS):
            return 0.0, ["CRITICAL: Route includes high-risk port"]

        # 2. RELATIONSHIP (Pairing History)
        past_trades = self._get_pairing_history(bl.shipper.name, bl.consignee.name)
        if past_trades == 0:
            score -= 20
            reasons.append("First-time pairing (-20)")
        else:
            reasons.append(f"Established Relationship ({past_trades} trades)")

        # 3. DATE CONSISTENCY
        if not bl.dateOfIssue:
            score -= 10
            reasons.append("Missing Issue Date")
        elif bl.shippedOnBoardDate and bl.dateOfIssue > bl.shippedOnBoardDate:
            score -= 20
            reasons.append("Invalid Dates: Issue > Shipped")

        # 4. FREIGHT TERM & INCOTERM ALIGNMENT
        # Logic: Does the financial agreement (Incoterm) match the logstical reality (Freight Term)?
        if bl.incoterm and bl.freightPaymentTerms:
            incoterm = bl.incoterm.upper()
            freight = bl.freightPaymentTerms.upper()

            # Case A: Seller supposed to pay (CIF), but Buyer asked to pay (COLLECT) -> Fraud Risk
            if incoterm in self.SELLER_PAYS_FREIGHT and "COLLECT" in freight:
                score -= 30
                reasons.append(
                    f"CONFLICT: Incoterm {incoterm} (Seller Pays) but Freight is COLLECT (-30)"
                )

            # Case B: Buyer supposed to pay (FOB), but Seller paid (PREPAID) -> Operational Warning
            elif incoterm in self.BUYER_PAYS_FREIGHT and "PREPAID" in freight:
                score -= 10
                reasons.append(
                    f"WARNING: Incoterm {incoterm} (Buyer Pays) but Freight is PREPAID (-10)"
                )

        # 5. DOCUMENT TYPE (Negotiable Instrument Risk)
        # Logic: 'To Order' B/Ls are bearers instruments (like cash) and riskier than named Waybills
        consignee_name = bl.consignee.name.upper()
        if "TO ORDER" in consignee_name:
            score -= 15
            reasons.append("High Risk Doc: Negotiable 'To Order' Bill of Lading (-15)")

        return max(0.0, score), reasons

    def _get_risk_rating_data(self, score: int) -> (str, str):
        """
        Returns a tuple of (Rating, Reasoning).
        Definitions based on standard Credit Rating Agency (CRA) terminology.
        """
        if score >= 96:
            return (
                "AAA",
                f"Score {score}/100: Prime. Highest credit quality; risk of default is negligible.",
            )
        if score >= 90:
            return (
                "AA",
                f"Score {score}/100: High Grade. Very strong capacity to meet financial commitments.",
            )
        if score >= 83:
            return (
                "A",
                f"Score {score}/100: Upper Medium Grade. Low credit risk; safe for standard processing.",
            )
        if score >= 75:
            return (
                "BBB",
                f"Score {score}/100: Investment Grade. Adequate capacity to meet commitments, but subject to adverse conditions.",
            )
        if score >= 65:
            return (
                "BB",
                f"Score {score}/100: Speculative. Faces major ongoing uncertainties or exposure to adverse conditions.",
            )
        if score >= 50:
            return (
                "B",
                f"Score {score}/100: Highly Speculative. Adverse business or economic conditions will likely lead to default.",
            )

        return (
            "C",
            f"Score {score}/100: Default Imminent. Extremely high risk; transaction should be rejected.",
        )

    def calculate(self, bl: BillOfLadingInput):
        """
        Main orchestration function.
        1. Calculates sub-scores (Seller, Buyer, Transaction).
        2. Applies simulated event penalties.
        3. Derives final Risk Rating (AAA) and Band (Low/High).
        4. Logs everything to the database for audit.
        """

        # --- STEP 1: Calculate Sub-Scores ---
        # These methods now include the Granular Metrics (Feature 4)
        # and Advanced Transaction Validation (Feature 3)
        s_score, s_reasons = self._score_seller(bl.shipper.name)
        b_score, b_reasons = self._score_buyer(bl.consignee.name)
        t_score, t_reasons = self._score_transaction(bl)

        # --- STEP 2: Weighted Base Calculation ---
        base_score = (
            (s_score * self.W_SELLER)
            + (b_score * self.W_BUYER)
            + (t_score * self.W_TXN)
        )

        # --- STEP 3: Apply Event Penalties (Feature 1) ---
        event_penalty = 0
        event_logs = []

        if bl.simulated_events:
            for event in bl.simulated_events:
                # Severity is usually negative (e.g. -15), so we add it
                event_penalty += event.severity

                log_entry = f"{event.type}: {event.description} ({event.severity})"
                event_logs.append(log_entry)

                # Add to Transaction Reasons so it appears in the breakdown too
                t_reasons.append(f"EVENT: {event.description} ({event.severity})")

        # Combine and Clamp Score (0 to 100)
        final_score = int(base_score + event_penalty)
        final_score = max(0, min(100, final_score))

        # --- STEP 4: Derive Ratings & Bands (Feature 5) ---
        rating, reasoning = self._get_risk_rating_data(final_score)

        # Map Score to Risk Band (Actionable Category)
        # AAA, AA, A -> LOW
        # BBB, BB -> MEDIUM
        # B, C -> HIGH
        if final_score >= 83:
            band = "LOW"
        elif final_score >= 65:
            band = "MEDIUM"
        else:
            band = "HIGH"

        # --- STEP 5: Database Audit Logging ---
        # Fetch IDs for Foreign Keys
        seller = self._get_participant(bl.shipper.name, "SELLER")
        buyer = self._get_participant(bl.consignee.name, "BUYER")

        log = ScoringLog(
            transaction_ref=bl.blNumber,
            # Audit Fields (Raw Text)
            raw_shipper_name=bl.shipper.name,
            raw_consignee_name=bl.consignee.name,
            # Entity Links (Nullable)
            seller_id=seller.id if seller else None,
            buyer_id=buyer.id if buyer else None,
            # Results
            final_score=final_score,
            risk_rating=rating,  # e.g. "AAA"
            risk_rating_reasoning=reasoning,  # e.g. "Prime. Highest credit..."
            risk_band=band,  # e.g. "LOW"
            # Metadata
            events_summary=" | ".join(event_logs) if event_logs else None,
        )
        self.db.add(log)
        self.db.commit()

        # --- STEP 6: Return API Response ---
        return {
            "transaction_ref": bl.blNumber,
            "overall_score": final_score,
            "risk_rating": rating,
            "risk_rating_reasoning": reasoning,
            "risk_band": band,
            "event_penalty": event_penalty,
            "breakdown": [
                {"type": "Seller Score", "score": s_score, "reasons": s_reasons},
                {"type": "Buyer Score", "score": b_score, "reasons": b_reasons},
                {"type": "Transaction Score", "score": t_score, "reasons": t_reasons},
            ],
        }
