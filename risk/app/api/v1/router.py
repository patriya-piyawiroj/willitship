from fastapi import APIRouter
from app.api.v1.endpoints import scoring

api_router = APIRouter()
api_router.include_router(scoring.router, prefix="/scoring", tags=["scoring"])