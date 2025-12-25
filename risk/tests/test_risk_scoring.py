def test_low_risk_scenario(client):
    """
    Test Case 1: Low Risk (Auto-Release)
    Scenario: A verified seller and a reliable buyer with consistent documents.
    Expected: Risk Score >= 80, Band = LOW
    """
    payload = {
        "blNumber": "COSU6300192830",
        "shipper": {
            "name": "TRUSTED EXPORTS LTD",
            "address": {
                "street": "123 Port Rd",
                "city": "Ho Chi Minh",
                "country": "VN"
            }
        },
        "consignee": {
            "name": "GLOBAL IMPORTS LLC",
             "address": {
                "street": "456 Commerce Blvd",
                "city": "Los Angeles",
                "country": "US"
            }
        },
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
        "vessel": "COSCO STAR",
        "voyageNo": "V102E",
        "grossWeight": 15000.5,
        "dateOfIssue": "2025-10-01",
        "shippedOnBoardDate": "2025-09-30",
        "incoterm": "FOB",
        "freightPaymentTerms": "FREIGHT COLLECT"
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["riskBand"] == "LOW"
    assert data["overallScore"] >= 80
    assert data["transactionRef"] == payload["blNumber"]


def test_high_risk_scenario(client):
    """
    Test Case 2: High Risk (Sanctions)
    Scenario: Route involves 'BANDAR ABBAS', a high-risk port.
    Expected: transaction = 0, Risk Band not LOW (likely HIGH or MEDIUM depending on weights)
    """
    payload = {
        "blNumber": "IRISL829102",
        "shipper": {"name": "NEWBIE TRADERS INC"},
        "consignee": {"name": "GLOBAL IMPORTS LLC"},
        "portOfLoading": "BANDAR ABBAS",
        "portOfDischarge": "DUBAI",
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Check that it detected the sanctioned port
    tx_component = next(c for c in data["breakdown"] if c["scoreType"] == "transaction")
    assert tx_component["score"] == 0.0
    assert any("Route includes high-risk port" in r for r in tx_component["reasons"])

    # Overall score should be impacted
    assert data["overallScore"] < 80


def test_data_inconsistency_warning(client):
    """
    Test Case 3: Data Inconsistency
    Scenario: dateOfIssue is BEFORE shippedOnBoardDate (Predated/Backdated)
    Expected: Penalty applied to transaction.
    """
    payload = {
        "blNumber": "WARN-DAT-009",
        "shipper": {"name": "TRUSTED EXPORTS LTD"},
        "consignee": {"name": "GLOBAL IMPORTS LLC"},
        "portOfLoading": "Shanghai",
        "portOfDischarge": "Hamburg",
        "dateOfIssue": "2023-10-05",  # Issue BEFORE Shipped
        "shippedOnBoardDate": "2023-10-10",
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    tx_component = next(c for c in data["breakdown"] if c["scoreType"] == "transaction")
    assert any(
        "Invalid Dates: Issue Date predates Shipped Date" in r
        for r in tx_component["reasons"]
    )

    assert tx_component["score"] <= 80


def test_simulated_event_penalty(client):
    """
    Test Case 4: Simulated Events
    Scenario: User injects a custom 'Typhoon' event with a -15 penalty.
    Expected: Base score is calculated, then -15 is applied.
    """
    payload = {
        "blNumber": "EVENT-TEST-001",
        "shipper": {"name": "TRUSTED EXPORTS LTD"},
        "consignee": {"name": "GLOBAL IMPORTS LLC"},
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
        "dateOfIssue": "2025-10-01",
        "simulatedEvents": [
            {"riskType": "WEATHER", "description": "Typhoon Warning", "severity": -15}
        ],
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["eventPenalty"] == -15

    # Check that the reason was added
    tx_component = next(c for c in data["breakdown"] if c["scoreType"] == "transaction")
    assert any("Typhoon Warning" in r for r in tx_component["reasons"])


def test_incoterm_freight_mismatch(client):
    """
    Test Case 5: Incoterm vs Freight Term Mismatch
    Scenario: Incoterm CIF (Seller Pays) but Freight is COLLECT (Buyer Pays)
    Expected: -15 Penalty (Warning)
    """
    payload = {
        "blNumber": "INCO-TEST-001",
        "shipper": {"name": "TRUSTED EXPORTS LTD"},
        "consignee": {"name": "GLOBAL IMPORTS LLC"},
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
        "incoterm": "CIF",
        "freightPaymentTerms": "FREIGHT COLLECT",
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    tx_component = next(c for c in data["breakdown"] if c["scoreType"] == "transaction")
    assert any("WARNING: Incoterm CIF" in r for r in tx_component["reasons"])
    assert tx_component["score"] < 80


def test_negotiable_instrument_risk(client):
    """
    Test Case 6: 'To Order' Bill of Lading
    Scenario: Consignee is 'TO ORDER'
    Expected: -15 Penalty
    """
    payload = {
        "blNumber": "ORDER-TEST-001",
        "shipper": {"name": "TRUSTED EXPORTS LTD"},
        "consignee": {"name": "TO ORDER OF BANK"},
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    tx_component = next(c for c in data["breakdown"] if c["scoreType"] == "transaction")
    assert any("Negotiable 'To Order'" in r for r in tx_component["reasons"])


def test_advanced_metrics(client):
    """
    Test Case 7: Advanced Metrics (Revenue, Amendment Rate, etc.)
    Scenario:
      - Seller: 'NEWBIE TRADERS INC' (High Amendment Rate 0.50 -> Score -15)
      - Buyer: 'RISKY BUYING CO' (Low Port Consistency 0.20 -> Score -15)
    Expected: Penalties applied for operational incompetence.
    """
    payload = {
        "blNumber": "ADV-TEST-001",
        "shipper": {"name": "NEWBIE TRADERS INC"},
        "consignee": {"name": "RISKY BUYING CO"},
        "portOfLoading": "SHANGHAI",
        "portOfDischarge": "BANGKOK",
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Check Seller Penalty
    s_component = next(c for c in data["breakdown"] if c["scoreType"] == "seller")
    assert any("High Documentation Error Rate" in r for r in s_component["reasons"])

    # Check Buyer Penalty
    b_component = next(c for c in data["breakdown"] if c["scoreType"] == "buyer")
    assert any("Erratic Port Usage" in r for r in b_component["reasons"])
    assert any("Litigious Buyer" in r for r in b_component["reasons"])


def test_unverified_parties(client):
    """
    Test Case 8: Unverified / Unknown Parties
    Scenario: Shipper and Consignee are not in the database.
    Expected: Penalties for Unknown Entity (-30 approx each or default scores) + KYC Risk.
    """
    payload = {
        "blNumber": "UNKNOWN-001",
        "shipper": {
            "name": "GHOST TRADERS LLC",
            "address": {"city": "Nowhere", "country": "XX"}
        },
        "consignee": {
            "name": "MYSTERY BUYER INC",
            "address": {"city": "Void", "country": "ZZ"}
        },
        "portOfLoading": "SHANGHAI",
        "portOfDischarge": "ROTTERDAM"
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Expect scores to be low because they are unknown
    s_component = next(c for c in data["breakdown"] if c["scoreType"] == "seller")
    b_component = next(c for c in data["breakdown"] if c["scoreType"] == "buyer")

    assert s_component["score"] <= 50.0
    assert any("Unknown Seller" in r for r in s_component["reasons"])
    
    assert b_component["score"] <= 50.0
    assert any("Unknown Buyer" in r for r in b_component["reasons"])


def test_high_volume_seller_bonus(client):
    """
    Test Case 9: High Volume Seller Bonus
    Scenario: TRUSTED EXPORTS LTD has >1000 TEU revenue.
    Expected: Reason 'High Volume Seller' appears.
    """
    payload = {
        "blNumber": "VOL-BONUS-001",
        "shipper": {"name": "TRUSTED EXPORTS LTD"},
        "consignee": {"name": "GLOBAL IMPORTS LLC"},
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    s_component = next(c for c in data["breakdown"] if c["scoreType"] == "seller")
    # Verify the bonus reason or high score logic
    assert any("High Volume Seller" in r for r in s_component["reasons"])


def test_complex_suspicious_scenario(client):
    """
    Test Case 10: Complex Suspicious Scenario
    Scenario: 
      - Good Seller (Trusted)
      - Bad Buyer (Risky)
      - Date Mismatch (Issue < Shipped)
    Expected: Moderate Seller Score, Low Buyer Score, Low Transaction Score -> Overall Medium/High Risk.
    """
    payload = {
        "blNumber": "COMPLEX-001",
        "shipper": {"name": "TRUSTED EXPORTS LTD"},
        "consignee": {"name": "RISKY BUYING CO"},
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LAEM CHABANG",
        "dateOfIssue": "2023-10-01",
        "shippedOnBoardDate": "2023-10-05"
    }

    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()

    # 1. Transaction Score - Date Penalty
    tx_component = next(c for c in data["breakdown"] if c["scoreType"] == "transaction")
    assert any("Issue Date predates Shipped Date" in r for r in tx_component["reasons"])

    # 2. Buyer Score - Risky
    b_component = next(c for c in data["breakdown"] if c["scoreType"] == "buyer")
    assert b_component["score"] < 60 # Risky has defaults that lower score

    # 3. Overall should be pulled down
    assert data["riskBand"] in ["MEDIUM", "HIGH"]


def test_dashboard_stats(client):
    """
    Test Case 8: Dashboard Stats (GET /stats)
    Scenario: Fetch high-level KPIs.
    Expected: Returns totalTransactions, avgScore, highRiskCount.
    """
    # Create a few transactions first to have data
    client.post(
        "/api/v1/risk-assessments/",
        json={
            "blNumber": "STAT-1",
            "shipper": {"name": "TRUSTED EXPORTS LTD"},
            "consignee": {"name": "GLOBAL IMPORTS LLC"},
            "portOfLoading": "A",
            "portOfDischarge": "B",
        },
    )

    response = client.get("/api/v1/risk-assessments/stats")
    assert response.status_code == 200
    data = response.json()

    assert "totalTransactions" in data
    assert "avgScore" in data
    assert "highRiskCount" in data
    assert data["totalTransactions"] > 0


def test_dashboard_history(client):
    """
    Test Case 9: Dashboard Log History (GET /)
    Scenario: Fetch paginated list of past assessments.
    Expected: List of assessments with Summary fields.
    """
    response = client.get("/api/v1/risk-assessments/")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    if len(data) > 0:
        row = data[0]
        assert "transactionRef" in row
        assert "score" in row
        assert "riskBand" in row
