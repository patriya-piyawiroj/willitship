"""
Database migration script to add missing columns to bill_of_ladings table.
Run this once to update the database schema to match the model.
"""
import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from dotenv import load_dotenv
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env from root directory
env_path = Path(__file__).parent.parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

def migrate_database():
    """Add missing columns to bill_of_ladings table if they don't exist and create new tables."""
    db_password = os.getenv("DB_PASSWORD", "")
    if not db_password:
        logger.warning("DB_PASSWORD not set in .env, migration might fail if password is required")
        
    db_connection_string = f"postgresql://postgres.myvcenyferzzohepsauv:{db_password}@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
    
    engine = create_engine(db_connection_string)
    
    # Import models to register them with Base
    try:
        # Try relative import if running as module
        from .models import Base, ShipmentDetails
    except ImportError:
        # Add parent directory to path to import api.models
        import sys
        sys.path.append(str(Path(__file__).parent.parent))
        from api.models import Base, ShipmentDetails

    logger.info("Creating missing tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tables created (if missing)")

    # Columns to add if they don't exist (Legacy migration for BillOfLading)
    columns_to_add = [
        ("contract_address", "VARCHAR(42) NOT NULL DEFAULT ''"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_inactive", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_full", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_settled", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("total_funded", "VARCHAR(78) NOT NULL DEFAULT '0'"),
        ("total_paid", "VARCHAR(78) NOT NULL DEFAULT '0'"),
        ("total_claimed", "VARCHAR(78) NOT NULL DEFAULT '0'"),
    ]
    
    with engine.connect() as conn:
        for column_name, column_def in columns_to_add:
            try:
                # Check if column exists
                check_sql = text(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='bill_of_ladings' AND column_name='{column_name}'
                """)
                result = conn.execute(check_sql)
                exists = result.fetchone() is not None
                
                if not exists:
                    logger.info(f"Adding column: {column_name}")
                    alter_sql = text(f"ALTER TABLE bill_of_ladings ADD COLUMN {column_name} {column_def}")
                    conn.execute(alter_sql)
                    conn.commit()
                    logger.info(f"✅ Added column: {column_name}")
                else:
                    logger.info(f"Column {column_name} already exists, skipping")
            except Exception as e:
                logger.error(f"Error adding column {column_name}: {e}")
                conn.rollback()
    
    # New columns for ShipmentDetails table (Risk Scoring)
    shipment_details_columns = [
        ("risk_score", "INTEGER"),
        ("risk_rating", "VARCHAR(10)"),
        ("risk_band", "VARCHAR(20)"),
        ("risk_reasoning", "TEXT"),
    ]
    
    with engine.connect() as conn:
        for column_name, column_def in shipment_details_columns:
            try:
                # Check if column exists
                check_sql = text(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='shipment_details' AND column_name='{column_name}'
                """)
                result = conn.execute(check_sql)
                exists = result.fetchone() is not None
                
                if not exists:
                    logger.info(f"Adding column to shipment_details: {column_name}")
                    alter_sql = text(f"ALTER TABLE shipment_details ADD COLUMN {column_name} {column_def}")
                    conn.execute(alter_sql)
                    conn.commit()
                    logger.info(f"✅ Added column: {column_name}")
                else:
                    logger.info(f"Column {column_name} already exists in shipment_details, skipping")
            except Exception as e:
                logger.error(f"Error adding column {column_name}: {e}")
                conn.rollback()
    
    logger.info("✅ Database migration complete!")

if __name__ == "__main__":
    migrate_database()

