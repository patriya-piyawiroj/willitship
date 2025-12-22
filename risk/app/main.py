from fastapi import FastAPI

app = FastAPI(title="risk service")


@app.get("/test")
def test_endpoint():
    return {
        "service": "risk",
        "status": "ok",
        "message": "hello from risk service",
    }

