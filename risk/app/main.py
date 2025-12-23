from fastapi import FastAPI
from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(title="risk service")

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/test")
def test_endpoint():
    return {
        "service": "risk",
        "status": "ok",
        "message": "hello from risk service",
    }