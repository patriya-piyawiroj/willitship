
def test_low_risk_scenario(client):
    """
    Test Case 1: Low Risk (Auto-Release)
    Scenario: A verified seller and a reliable buyer with consistent documents.
    Expected: Risk Score >= 80, Band = LOW
    """
    payload = {
        "blNumber": "COSU6300192830",
        "shipper": { "name": "TRUSTED EXPORTS LTD" },
        "consignee": { "name": "GLOBAL IMPORTS LLC" },
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
        "dateOfIssue": "2025-10-01"
    }
    
    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    assert data["risk_band"] == "LOW"
    assert data["overall_score"] >= 80
    assert data["transaction_ref"] == payload["blNumber"]

def test_high_risk_scenario(client):
    """
    Test Case 2: High Risk (Sanctions)
    Scenario: Route involves 'BANDAR ABBAS', a high-risk port.
    Expected: Transaction Score = 0, Risk Band not LOW (likely HIGH or MEDIUM depending on weights)
              Actually, if Transaction Score is 0, overall will drop significantly.
    """
    payload = {
        "blNumber": "IRISL829102",
        "shipper": { "name": "NEWBIE TRADERS INC" },
        "consignee": { "name": "GLOBAL IMPORTS LLC" },
        "portOfLoading": "BANDAR ABBAS",
        "portOfDischarge": "DUBAI"
    }
    
    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    # Check that it detected the sanctioned port
    tx_component = next(c for c in data["breakdown"] if c["type"] == "Transaction Score")
    assert tx_component["score"] == 0.0
    assert any("Sanctioned Port" in r for r in tx_component["reasons"])
    
    # Overall score should be impacted
    assert data["overall_score"] < 80

def test_data_inconsistency_warning(client):
    """
    Test Case 3: Data Inconsistency
    Scenario: dateOfIssue is AFTER shippedOnBoardDate
    Expected: Penalty applied to Transaction Score.
    """
    payload = {
        "blNumber": "WARN-DAT-009",
        "shipper": { "name": "TRUSTED EXPORTS LTD" },
        "consignee": { "name": "GLOBAL IMPORTS LLC" },
        "portOfLoading": "Shanghai",
        "portOfDischarge": "Hamburg",
        "dateOfIssue": "2023-10-15",
        "shippedOnBoardDate": "2023-10-10"
    }
    
    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    tx_component = next(c for c in data["breakdown"] if c["type"] == "Transaction Score")
    assert any("Invalid Dates" in r for r in tx_component["reasons"])
    
    # Score penalty typically -20
    assert tx_component["score"] <= 80

def test_simulated_event_penalty(client):
    """
    Test Case 4: Simulated Events
    Scenario: User injects a custom 'Typhoon' event with a -15 penalty.
    Expected: Base score is calculated, then -15 is applied.
    """
    payload = {
        "blNumber": "EVENT-TEST-001",
        "shipper": { "name": "TRUSTED EXPORTS LTD" },
        "consignee": { "name": "GLOBAL IMPORTS LLC" },
        "portOfLoading": "HO CHI MINH",
        "portOfDischarge": "LOS ANGELES",
        "dateOfIssue": "2025-10-01",
        "simulated_events": [
            {
                "type": "WEATHER",
                "description": "Typhoon Warning",
                "severity": -15
            }
        ]
    }
    
    response = client.post("/api/v1/risk-assessments/", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    # Trusted shipper/buyer typically gives ~100 base score (or close to it)
    # The event should drop it by exactly 15 points from the base
    assert data["event_penalty"] == -15
    
    # Check that the reason was added
    tx_component = next(c for c in data["breakdown"] if c["type"] == "Transaction Score")
    assert any("Typhoon Warning" in r for r in tx_component["reasons"])
