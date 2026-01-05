from fastapi import FastAPI
from app.api.v1.router import api_router
from app.core.config import settings

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="risk service")

# Configure CORS
origins = [
    "http://localhost",
    "http://localhost:5500",  # Common local static server port
    "http://localhost:8000",
    "http://127.0.0.1:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for hackathon convenience
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/test")
def test_endpoint():
    return {
        "service": "risk",
        "status": "ok",
        "message": "hello from risk service",
    }
