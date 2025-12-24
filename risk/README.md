# Risk Scoring API

A risk scoring api that analyzes Bill of Lading (B/L) data to calculate risk scores for Sellers, Buyers, and specific Transactions.

## 🚀 Features

* **Scoring Engine**: Calculates a weighted risk score (0-100) based on:
    * **Seller Score (35%)**: Years in operation, KYC status, claims history.
    * **Buyer Score (45%)**: Payment behavior, financial reliability.
    * **Transaction Score (20%)**: Route risks, port sanctions, document consistency.
* **Risk Bands**: Automatically categorizes transactions into **Low**, **Medium**, or **High** risk.
* **Credit Ratings**: Assigns a CRA-style rating (e.g., **AAA**, **BBB**, **C**) with detailed reasoning.
* **Explainability**: Returns human-readable "Reasons" for every score deduction.
* **Enhanced Risk Logic**:
    *   **Volume & Operations**: Factors in revenue and documentation error rates for Sellers.
    *   **Behavioral Analysis**: Tracks port consistency and dispute rates for Buyers.
    *   **Incoterm Validation**: Cross-checks Incoterms against Freight Payment terms to detect fraud.
*   **Event Simulation**: Accepts external risk events (e.g., "Typhoon", "Port Strike") to dynamically adjust scores.
* **Audit Logging**: Records detailed scoring logs, including raw document names and links to resolved Seller/Buyer entities for historical analysis.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

*   **Docker & Docker Compose**: For running the application and database in containers.
*   **Git**: To clone the repository.
*   **(Optional) Python 3.9+ & PostgreSQL**: Only required if running locally without Docker.

## 🛠️ Setup & Installation

You can run the service using **Docker** (recommended) or set it up **manually** for local development.

### Option 1: Quick Start (Docker)

This is the easiest way to get the service running, as it sets up both the API and the PostgreSQL database automatically.

1.  **Start the services**:
    ```bash
    docker-compose up --build
    ```
    *This will start the PostgreSQL database and the API service.*

2.  **Access the API**:
    *   The API will be available at `http://localhost:8003`.
    *   **Interactive Documentation**: Open [http://localhost:8003/docs](http://localhost:8003/docs) to see and test the endpoints.

### Option 2: Local Development

**Prerequisites**: Python 3.9+, PostgreSQL

1.  **Set up Virtual Environment**:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

2.  **Install Dependencies**:
    ```bash
    pip install -r requirements-dev.txt
    ```

3.  **Configuration**:
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Edit `.env` and set your `DATABASE_URL` to point to your local PostgreSQL instance:
        ```ini
        DATABASE_URL=postgresql://user:password@localhost:5432/risk_scoring
        ```

4.  **Initialize Database**:
    Run the initialization script to create the necessary tables:
    ```bash
    python scripts/init_db.py
    ```

5.  **Run the Service**:
    You can use the provided script or run uvicorn directly.
    ```bash
    # Option A: Using run.sh (Defaults to port 8003)
    ./run.sh

    # Option B: Direct uvicorn (Defaults to port 8000)
    uvicorn app.main:app --reload
    ```
6. **Code Formatting**:
    ```bash
    black .
    ```

## ⚡ Running Risk Scoring

To calculate a risk score, send a `POST` request to the analysis endpoint with the Bill of Lading data.

**Endpoint**: `POST /api/v1/risk-assessments`

### Example Request

 you can use `curl` to test the endpoint:

```bash
curl -X 'POST' \
  'http://localhost:8003/api/v1/risk-assessments' \
  -H 'Content-Type: application/json' \
  -d '{
  "blNumber": "COSU6182093780",
  "shipper": {
    "name": "Global Electronics Export Ltd",
    "address": {}
  },
  "consignee": {
    "name": "Tech Importers Inc",
    "address": {}
  },
  "portOfLoading": "Shanghai",
  "portOfDischarge": "Los Angeles",
  "incoterm": "FOB",
  "freightPaymentTerms": "FREIGHT COLLECT",
  "simulated_events": [
    {
      "risk_type": "WEATHER",
      "description": "Typhoon approaching East China Sea",
      "severity": -10
    }
  ]
}'
```

*(Note: If running via `./run.sh`, change the port from `8000` to `8003`)*

### Example Response

The API will return the calculated risk score, risk band, and a breakdown of the components:

```json
{
  "transaction_ref": "COSU6182093780",
  "overall_score": 85,
  "risk_rating": "A",
  "risk_rating_reasoning": "Score 85/100: Upper Medium Grade. Low credit risk; safe for standard processing.",
  "risk_band": "LOW",
  "breakdown": [
    {
      "score_type": "seller",
      "score": 90,
      "reasons": []
    },
    {
      "score_type": "buyer",
      "score": 80,
      "reasons": ["Minor payment verify delay"]
    },
    {
      "score_type": "transaction",
      "score": 85,
      "reasons": []
    }
  ]
}
```


## 📊 Database Schema

The system tracks Participants (Sellers/Buyers) and logs every Scoring Request for audit and historical analysis.

```mermaid
erDiagram
    Participant {
        int id PK
        string name
        string country_code
        string entity_type "SELLER or BUYER"
        int years_in_operation
        float historical_claim_rate
        float on_time_payment_rate
        string kyc_status
        int annual_revenue_teu
        float bl_amendment_rate
        float port_consistency
        float document_dispute_rate
    }

    HistoricalTransaction {
        int id PK
        string bl_number
        int seller_id FK
        int buyer_id FK
        string status
        datetime completion_date
    }

    Participant ||--o{ HistoricalTransaction : "seller"
    Participant ||--o{ HistoricalTransaction : "buyer"
```

### 📚 Data Dictionary

Key fields and their definitions:

#### Participant (Seller/Buyer)
| Field | Type | Description |
|-------|------|-------------|
| `kyc_status` | String | Verification status: `VERIFIED`, `PENDING`, `REJECTED`. |
| `historical_claim_rate` | Float | Percentage of past shipments with claims (0.0 - 1.0). >5% is risky. |
| `annual_revenue_teu` | Integer | Volume in TEU (Twenty-foot Equivalent Unit). Logic: High volume (>1000) = Reliable. |
| `bl_amendment_rate` | Float | Rate of B/L corrections. >20% indicates operational incompetence. |
| `port_consistency` | Float | (Buyer) How often they use the same discharge ports. <50% is suspicious. |
| `document_dispute_rate` | Float | (Buyer) Frequency of rejecting documents to delay payment. |

#### Historical Transaction (Verified Trades)
| Field | Type | Description |
|-------|------|-------------|
| `bl_number` | String | Unique Bill of Lading number for the past shipment. |
| `status` | String | Status of the trade: `COMPLETED`, `CANCELLED`, `PENDING`. |
| `completion_date` | DateTime | When the trade was finalized. |

## 📂 Project Structure

```text
.
├── app/
│   ├── api/v1/         # Endpoint Routers
│   ├── core/           # Config & DB connection
│   ├── models/         # SQLAlchemy Tables (Participants, Logs)
│   ├── schemas/        # Pydantic Models (Input/Output)
│   └── services/       # Risk Engine Logic (Business Layer)
├── scripts/            # Database initialization scripts
├── tests/              # Integration Tests
├── .env                # Environment Variables
├── docker-compose.yml  # Docker orchestration
└── run.sh              # Start-up helper script
```

## 🧪 Test Scenarios

Use these payloads to test how the risk engine responds to different factors.

### 1. Low Risk Scenario (Auto-Release)
**Scenario**: The Happy Path
* Trusted Seller & Buyer.
* Verified Pairing History (seeded in conftest).
* Valid Route (No Sanctions).
* Valid Dates (Issue Date >= Shipped Date).
* Perfect Incoterm/Freight match (FOB + Collect).

**Expectation**: Score > 90 (AAA), Band LOW.

```json
{
  "blNumber": "HAPPY-001",
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
  "dateOfIssue": "2023-11-02",
  "shippedOnBoardDate": "2023-11-01"
}
```

### 2. High Risk Scenario (Sanctions Violation)
**Scenario**: The Compliance Block
* Trusted Participants (high base score).
* BUT Route includes 'BANDAR ABBAS' (Hardcoded High Risk Port).

**Expectation**: Score < 50 (D), Band CRITICAL.

```json
{
  "blNumber": "BLOCK-009",
  "shipper": {
    "name": "TRUSTED EXPORTS LTD",
    "address": {
      "city": "Dubai",
      "country": "AE"
    }
  },
  "consignee": {
    "name": "GLOBAL IMPORTS LLC",
    "address": {
      "city": "Hamburg",
      "country": "DE"
    }
  },
  "portOfLoading": "BANDAR ABBAS",
  "portOfDischarge": "HAMBURG",
  "vessel": "RISKY BUSINESS",
  "dateOfIssue": "2023-11-01"
}
```

### 3. Data Inconsistency (Medium/High Warning)
**Scenario**: The Time Traveler
* Trusted Participants.
* Issue Date is BEFORE Shipped Date (Predating).

**Expectation**: Score < 50 (D), Band CRITICAL.
```json
{
  "blNumber": "TIME-001",
  "shipper": {
    "name": "TRUSTED EXPORTS LTD",
    "address": {
      "city": "Hanoi",
      "country": "VN"
    }
  },
  "consignee": {
    "name": "GLOBAL IMPORTS LLC",
    "address": {
      "city": "Seattle",
      "country": "US"
    }
  },
  "portOfLoading": "HAIPHONG",
  "portOfDischarge": "SEATTLE",
  "dateOfIssue": "2023-10-01",
  "shippedOnBoardDate": "2023-10-15"
}
```

## 💾 Managing Data

The service comes with a database initialization script that creates tables and seeds some mock participants.

### Automatic Seeding
When running via Docker Compose, the `scripts/init_db.py` script runs automatically on startup.
*   It creates the database tables if they don't exist.
*   It adds mock Sellers and Buyers (e.g., "TRUSTED EXPORTS LTD", "RISKY BUYING CO") if the database is empty.

### Adding Data Manually
To add more data to the running Docker database, you can use the `docker exec` command to access the PostgreSQL CLI.

1.  **Connect to the Database**:
    ```bash
    docker exec -it risk-scoring-db psql -U postgres -d risk_scoring
    ```

2.  **Run SQL Commands**:
    You can now insert data directly. For example, to add a new Seller:
    ```sql
    INSERT INTO participants (participant_id, name, entity_type, country_code, years_in_operation, kyc_status, historical_claim_rate)
    VALUES (gen_random_uuid(), 'NEW SELLER CORP', 'SELLER', 'DE', 5, 'VERIFIED', 0.0);
    ```

### Resetting Data
To completely reset the database (delete all data and start fresh), you need to remove the Docker volume.

```bash
docker-compose down -v
docker-compose up --build
```

## ✅ Testing

The project includes integration tests to verify the risk scoring logic against a test database.

**Run Tests**:
```bash
# Install test dependencies if needed
pip install pytest httpx

# Run tests
pytest tests/
```