from fastapi import FastAPI

app = FastAPI(title="smart-contract service")


@app.get("/test")
def test_endpoint():
    """Simple health-like endpoint used by the shell runner and docker compose."""
    return {
        "service": "smart-contract",
        "status": "ok",
        "message": "hello from smart-contract service",
    }

