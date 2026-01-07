"""
Seed Data Generator for Will It Ship?

Creates 9 sample shipments:
- 3 LOW Risk (Score >= 80) - Uses verified traders on safe routes
- 3 MEDIUM Risk (Score 60-79) - Unknown parties or risky elements
- 3 HIGH Risk (Score < 60) - Multiple risk factors combined

Risk scoring is done by the Risk API which evaluates:
- Seller verification status & history (35% weight)
- Buyer verification status & history (45% weight)  
- Transaction characteristics (20% weight)
"""
import requests
import json
import random
from datetime import datetime, timedelta

API_URL = "http://localhost:8004"

# Known ports from the Risk API
SAFE_PORTS = ["Shanghai", "Singapore", "Rotterdam", "Los Angeles", "Hamburg", "Tokyo", "Busan"]
HIGH_RISK_PORTS = ["Vladivostok", "Karachi", "Lagos", "Colombo"]  # Matches risk_engine.py

def generate_date(days_ago_min=1, days_ago_max=15):
    """Generate realistic dates for shipments currently in transit."""
    days_ago = random.randint(days_ago_min, days_ago_max)
    shipped_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
    issue_date = (datetime.now() - timedelta(days=days_ago + 1)).strftime("%Y-%m-%d")
    return shipped_date, issue_date


# =============================================================================
# LOW RISK SHIPMENTS (Score >= 80, Band: LOW)
# Characteristics: Known verified traders, safe ports, standard cargo
# =============================================================================
LOW_RISK_SHIPMENTS = [
    {
        "shipper": {"name": "TechGlobal Manufacturing Co.", "country": "China"},
        "consignee": {"name": "US Tech Distributors LLC", "country": "USA"},
        "origin": "Shanghai",
        "destination": "Los Angeles",
        "cargo": "Consumer Electronics - Smartphones",
        "value": 250000,
    },
    {
        "shipper": {"name": "European Auto Parts GmbH", "country": "Germany"},
        "consignee": {"name": "AutoZone Distribution Inc.", "country": "USA"},
        "origin": "Hamburg",
        "destination": "New York",
        "cargo": "Automotive Spare Parts",
        "value": 180000,
    },
    {
        "shipper": {"name": "Singapore Logistics Pte Ltd", "country": "Singapore"},
        "consignee": {"name": "Pacific Rim Trading Co.", "country": "Japan"},
        "origin": "Singapore",
        "destination": "Tokyo",
        "cargo": "Industrial Machinery Components",
        "value": 320000,
    },
]

# =============================================================================
# MEDIUM RISK SHIPMENTS (Score 60-79, Band: MEDIUM)
# Characteristics: Unknown parties OR risky elements (but not both)
# =============================================================================
MEDIUM_RISK_SHIPMENTS = [
    {
        "shipper": {"name": "New Global Traders Ltd.", "country": "China"},  # Unknown seller
        "consignee": {"name": "First Time Imports Inc.", "country": "USA"},   # Unknown buyer
        "origin": "Shenzhen",
        "destination": "Rotterdam",
        "cargo": "Textiles and Garments",
        "value": 95000,
    },
    {
        "shipper": {"name": "Emerging Markets Export Co.", "country": "India"},  # Unknown  
        "consignee": {"name": "Standard Retail Corp.", "country": "Germany"},
        "origin": "Mumbai",
        "destination": "Hamburg",
        "cargo": "Cotton Fabric Rolls",
        "value": 75000,
    },
    {
        "shipper": {"name": "Delta Shipping Solutions", "country": "Vietnam"},  # Unknown
        "consignee": {"name": "Budget Wholesale LLC", "country": "USA"},
        "origin": "Ho Chi Minh City",
        "destination": "Los Angeles",
        "cargo": "Furniture and Home Goods",
        "value": 120000,
        "to_order": True,  # Adds risk: Negotiable B/L
    },
]

# =============================================================================
# HIGH RISK SHIPMENTS (Score < 60, Band: HIGH)
# Characteristics: Multiple risk factors - unknown parties + risky ports/terms
# =============================================================================
HIGH_RISK_SHIPMENTS = [
    {
        "shipper": {"name": "Unverified Exports Ltd.", "country": "Unknown"},  # High risk
        "consignee": {"name": "Shell Company Imports", "country": "Unknown"},   # High risk
        "origin": "Vladivostok",  # High risk port
        "destination": "Karachi",  # High risk port
        "cargo": "Industrial Chemicals (Class 9)",
        "value": 45000,
        "to_order": True,  # Negotiable B/L adds risk
    },
    {
        "shipper": {"name": "Phantom Trading Corp.", "country": "Panama"},
        "consignee": {"name": "Offshore Holdings LLC", "country": "Cayman Islands"},
        "origin": "Lagos",  # High risk port
        "destination": "Colombo",  # High risk port  
        "cargo": "Miscellaneous Goods",
        "value": 25000,
        "to_order": True,
    },
    {
        "shipper": {"name": "Anonymous Exports", "country": "Unknown"},
        "consignee": {"name": "Cash Only Imports", "country": "Unknown"},
        "origin": "Karachi",  # High risk
        "destination": "Lagos",  # High risk
        "cargo": "Undeclared Merchandise",
        "value": 15000,
        "to_order": True,
        "invalid_dates": True,  # Issue date before shipped date
    },
]


def generate_shipment(config, index, risk_level):
    """Generate a shipment payload from configuration."""
    shipped_date, issue_date = generate_date()
    
    # For high risk with invalid dates, swap them
    if config.get("invalid_dates"):
        shipped_date, issue_date = issue_date, shipped_date
    
    consignee_name = config["consignee"]["name"]
    if config.get("to_order"):
        consignee_name = f"TO ORDER OF {config['consignee']['name']}"
    
    bl_number = f"BL-{datetime.now().year}-{risk_level.upper()[:1]}{random.randint(10000, 99999)}"
    
    return {
        "shipper": {
            "name": config["shipper"]["name"],
            "address": {
                "street": f"{random.randint(1, 999)} Trade Boulevard",
                "country": config["shipper"]["country"]
            }
        },
        "consignee": {
            "name": consignee_name,
            "blType": "TO ORDER" if config.get("to_order") else "STRAIGHT",
            "toOrderOfText": f"TO ORDER OF {config['consignee']['name']}" if config.get("to_order") else ""
        },
        "notifyParty": {
            "name": config["consignee"]["name"],
            "note": "Notify on arrival"
        },
        "billOfLading": {
            "blNumber": bl_number,
            "vessel": f"MV {random.choice(['Pacific', 'Atlantic', 'Orient', 'Global'])} {random.choice(['Voyager', 'Express', 'Carrier', 'Star'])}",
            "voyageNo": f"V{random.randint(100, 999)}E",
            "portOfLoading": config["origin"],
            "portOfDischarge": config["destination"],
            "placeOfReceipt": config["origin"],
            "placeOfDelivery": config["destination"],
        },
        "issuingBlock": {
            "dateOfIssue": issue_date,
            "shippedOnBoardDate": shipped_date,
            "declaredValue": str(config["value"])
        }
    }


def seed_database():
    print(f"🌱 Seeding database at {API_URL}...")
    print(f"   Creating 9 shipments (3 LOW, 3 MEDIUM, 3 HIGH risk)\n")
    
    all_shipments = [
        ("low", LOW_RISK_SHIPMENTS),
        ("medium", MEDIUM_RISK_SHIPMENTS),
        ("high", HIGH_RISK_SHIPMENTS),
    ]
    
    results = {"success": 0, "failed": 0}
    
    for risk_level, shipments in all_shipments:
        print(f"📦 Creating {risk_level.upper()} risk shipments:")
        for i, config in enumerate(shipments):
            payload = generate_shipment(config, i, risk_level)
            try:
                response = requests.post(f"{API_URL}/shipments", json=payload, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    score_info = ""
                    if data.get("riskScore"):
                        score_info = f" | Score: {data['riskScore']} ({data.get('riskBand', 'N/A')})"
                    print(f"   ✅ {payload['billOfLading']['blNumber']}: {config['origin']} → {config['destination']}{score_info}")
                    results["success"] += 1
                else:
                    print(f"   ❌ {payload['billOfLading']['blNumber']}: {response.status_code} - {response.text[:100]}")
                    results["failed"] += 1
            except Exception as e:
                print(f"   ❌ {payload['billOfLading']['blNumber']}: Error - {e}")
                results["failed"] += 1
        print()
    
    print(f"✨ Seeding complete!")
    print(f"   Success: {results['success']}, Failed: {results['failed']}")
    print(f"   Check the dashboard at http://localhost:8080/dashboard")


if __name__ == "__main__":
    seed_database()
