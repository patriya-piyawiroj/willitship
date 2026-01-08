# Risk Scoring API

A risk scoring api that analyzes Bill of Lading (B/L) data to calculate risk scores for Sellers, Buyers, and specific Transactions. Huge thanks to P'Benny for the technical spec which is mainly used as a reference for the implementation. [Link to the Doc](https://docs.google.com/document/d/1uVSqjMdJAPTK7IQ_cYae-BrcOtCyK0O3/edit?usp=sharing&ouid=106723140943877024803&rtpof=true&sd=true)

## Design Explanation
1. Right now the implementation is based on the assumption that the risk scoring endpoint will only be used once when the B/L is uploaded and extracted via OCR and for easy demo integration.
2. Another possible implementation that we can consider is to be able to update the risk score at any time not just when the B/L is uploaded and extracted via OCR. **[This could be put into the technical doc as a future enhancement]**
  * Imagine a scenario where the investor's dashboard showing the risk score of a specific B/L and the risk score changes after receiving crucial news that severely affects the transportation (weather, port strikes, etc.). 
  * For the implementation, after the B/L is uploaded and extracted via OCR, the info will be stored in a database and the risk scoring endpoint can pull the info from the Database and calculate the risk score. This will enable the endpoint to be used at any time to calculate the risk score for the B/L (for example, if we want to automatically change the score based on weather data, the buyer's credit rating changes from fraud, the company got sanctioned, etc.). basically changing from providing the bill of lading info to the risk scoring endpoint to providing the bill of lading id to the risk scoring endpoint instead.

  
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
  "simulatedEvents": [
    {
      "riskType": "WEATHER",
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
  "transactionRef": "COSU6182093780",
  "overallScore": 44,
  "riskRating": "C",
  "riskRatingReasoning": "Score 44/100: Default Imminent. Extremely high risk.",
  "riskBand": "HIGH",
  "eventPenalty": -10,
  "breakdown": [
    {
      "scoreType": "seller",
      "score": 50,
      "reasons": [
        "Unknown Seller: No history found."
      ]
    },
    {
      "scoreType": "buyer",
      "score": 50,
      "reasons": [
        "Unknown Buyer: No history found."
      ]
    },
    {
      "scoreType": "transaction",
      "score": 70,
      "reasons": [
        "First-time pairing (-20)",
        "Missing Issue Date",
        "EVENT: Typhoon approaching East China Sea (-10)"
      ]
    }
  ]
}
```


### Dashboard Endpoints

You can also retrieve historical data and high-level stats.

*   **List Assessments**: `GET /api/v1/risk-assessments/`
    *   Returns a paginated list of recent assessments.
*   **Get Stats**: `GET /api/v1/risk-assessments/stats`
    *   Returns KPIs like Total Transactions, Average Score, and High Risk Count.

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

    ScoringLog {
        int id PK
        string transaction_ref
        string raw_shipper_name
        string raw_consignee_name
        int final_score
        string risk_rating
        string risk_rating_reasoning
        string risk_band
        string events_summary
        datetime created_at
        int seller_id FK
        int buyer_id FK
    }

    Participant ||--o{ HistoricalTransaction : "seller"
    Participant ||--o{ HistoricalTransaction : "buyer"
    Participant ||--o{ ScoringLog : "seller"
    Participant ||--o{ ScoringLog : "buyer"
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

#### Scoring Log (Transaction)
| Field | Type | Description |
|-------|------|-------------|
| `transaction_ref` | String | The B/L Number or unique identifier for the transaction. |
| `raw_shipper_name` | String | Name of the shipper as provided in the input payload. |
| `raw_consignee_name` | String | Name of the consignee as provided in the input payload. |
| `final_score` | Integer | 0-100 Score. 100 is best. <50 is Critical Failure. |
| `risk_rating` | String | Credit Rating Agency style grade for investors (Reporting / Granularity): `AAA`, `AA`, `A`, `BBB`, `BB`, `B`, `C`. |
| `risk_rating_reasoning` | String | Detailed explanation text for the assigned rating. |
| `risk_band` | String | Simplified category for Decision Making (Auto-release vs. Hold): `LOW`, `MEDIUM`, `HIGH`. |
| `events_summary` | String | Pipe-separated log of matching Risk Events (e.g. "Typhoon: -15"). |
| `created_at` | DateTime | Timestamp when the scoring assessment was performed. |

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
* Verified Pairing History.
* Valid Route & Dates.
* Perfect Incoterm/Freight match (FOB + Collect).

**Expectation**: Score > 90 (AAA), Band LOW.

```json
{
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
```

### 2. High Risk Scenario (Sanctions Violation)
**Scenario**: The Compliance Block
* Trusted Participants.
* Route includes 'BANDAR ABBAS' (Hardcoded High Risk Port).

**Expectation**: Score < 50 (D), Band CRITICAL.

```json
{
  "blNumber": "IRISL829102",
  "shipper": {"name": "NEWBIE TRADERS INC"},
  "consignee": {"name": "GLOBAL IMPORTS LLC"},
  "portOfLoading": "BANDAR ABBAS",
  "portOfDischarge": "DUBAI"
}
```

### 3. Data Inconsistency (Warning)
**Scenario**: The Time Traveler
* Issue Date is BEFORE Shipped Date (Predating).

**Expectation**: Moderate/High Risk Warning.

```json
{
  "blNumber": "WARN-DAT-009",
  "shipper": {"name": "TRUSTED EXPORTS LTD"},
  "consignee": {"name": "GLOBAL IMPORTS LLC"},
  "portOfLoading": "Shanghai",
  "portOfDischarge": "Hamburg",
  "dateOfIssue": "2023-10-05",
  "shippedOnBoardDate": "2023-10-10"
}
```

### 4. Unverified / Unknown Parties
**Scenario**: Shipper and Consignee are not in the database.

**Expectation**: Penalties for Unknown Entity (-30 approx each).

```json
{
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
```

### 5. High Volume Seller Bonus
**Scenario**: TRUSTED EXPORTS LTD has >1000 TEU revenue.

**Expectation**: Bonus applied or High Score maintained.

```json
{
  "blNumber": "VOL-BONUS-001",
  "shipper": {"name": "TRUSTED EXPORTS LTD"},
  "consignee": {"name": "GLOBAL IMPORTS LLC"},
  "portOfLoading": "HO CHI MINH",
  "portOfDischarge": "LOS ANGELES"
}
```

### 6. Complex Suspicious Scenario
**Scenario**: Good Seller vs. Risky Buyer + Date Mismatch.

**Expectation**: Medium/High Risk due to mixed signals.

```json
{
  "blNumber": "COMPLEX-001",
  "shipper": {
    "name": "TRUSTED EXPORTS LTD"
  },
  "consignee": {
    "name": "RISKY BUYING CO"
  },
  "portOfLoading": "HO CHI MINH",
  "portOfDischarge": "LAEM CHABANG",
  "dateOfIssue": "2023-10-01",
  "shippedOnBoardDate": "2023-10-05"
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
    INSERT INTO participants (name, entity_type, country_code, years_in_operation, kyc_status, historical_claim_rate)
    VALUES ('NEW SELLER CORP', 'SELLER', 'DE', 5, 'VERIFIED', 0.0);
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