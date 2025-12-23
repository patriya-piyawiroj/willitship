# Risk Scoring API

A risk scoring api that analyzes Bill of Lading (B/L) data to calculate risk scores for Sellers, Buyers, and specific Transactions[cite: 5].

## 🚀 Features

* **Scoring Engine**: Calculates a weighted risk score (0-100) based on:
    * **Seller Score (35%)**: Years in operation, KYC status, claims history[cite: 50].
    * **Buyer Score (45%)**: Payment behavior, financial reliability[cite: 50].
    * **Transaction Score (20%)**: Route risks, port sanctions, document consistency[cite: 50].
* **Risk Bands**: Automatically categorizes transactions into **Low**, **Medium**, or **High** risk[cite: 55].
* **Explainability**: Returns human-readable "Reasons" for every score deduction[cite: 7].
* **Audit Logging**: Records detailed scoring logs, including raw document names and links to resolved Seller/Buyer entities for historical analysis.

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
    pip install -r requirements.txt
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
  "goods_description": "Electronics",
  "grossWeight": 1500.0
}'
```

*(Note: If running via `./run.sh`, change the port from `8000` to `8003`)*

### Example Response

The API will return the calculated risk score, risk band, and a breakdown of the components:

```json
{
  "transaction_ref": "COSU6182093780",
  "overall_score": 85,
  "risk_band": "LOW",
  "breakdown": [
    {
      "type": "seller",
      "score": 90,
      "reasons": []
    },
    {
      "type": "buyer",
      "score": 80,
      "reasons": ["Minor payment verify delay"]
    },
    {
      "type": "transaction",
      "score": 85,
      "reasons": []
    }
  ]
}
```

## 🧪 Test Scenarios

Use these payloads to test how the risk engine responds to different factors.

### 1. Low Risk Scenario (Auto-Release)
**Scenario**: A verified seller and a reliable buyer with consistent documents.

```json
{
  "blNumber": "COSU6300192830",
  "shipper": { "name": "TRUSTED EXPORTS LTD" },
  "consignee": { "name": "GLOBAL IMPORTS LLC" },
  "portOfLoading": "HO CHI MINH",
  "portOfDischarge": "LOS ANGELES",
  "dateOfIssue": "2025-10-01"
}
```

### 2. High Risk Scenario (Sanctions Violation)
**Scenario**: The route involves a high-risk port (Bandar Abbas), triggering an immediate critical failure.

```json
{
  "blNumber": "IRISL829102",
  "shipper": { "name": "NEWBIE TRADERS INC" },
  "consignee": { "name": "GLOBAL IMPORTS LLC" },
  "portOfLoading": "BANDAR ABBAS",
  "portOfDischarge": "DUBAI"
}
```

### 3. Data Inconsistency (Medium/High Warning)
**Scenario**: The `dateOfIssue` is after the `shippedOnBoardDate`, which is logically impossible and penalizes the score.

```json
{
  "blNumber": "WARN-DAT-009",
  "shipper": { "name": "Global Electronics Export Ltd" },
  "consignee": { "name": "Tech Importers Inc" },
  "portOfLoading": "Shanghai",
  "portOfDischarge": "Hamburg",
  "dateOfIssue": "2023-10-15",
  "shippedOnBoardDate": "2023-10-10"
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