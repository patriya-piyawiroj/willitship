"""
Database utilities and session management.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv
from pathlib import Path

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    # Fallback to current directory
    load_dotenv()

# Database setup
# Use local PostgreSQL Docker service
db_connection_string = "postgresql://postgres:postgres123@db:5432/willitship"

engine = create_engine(db_connection_string, poolclass=NullPool, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def wei_to_tokens(wei_value: str) -> float:
    """Convert wei value to token amount (18 decimals)."""
    try:
        return float(wei_value) / (10 ** 18)
    except (ValueError, TypeError):
        return 0.0
