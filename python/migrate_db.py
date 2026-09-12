import sys
import os
from sqlalchemy import text
from dotenv import load_dotenv

# Load from project root .env
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.db import engine, SessionLocal
from database.models import Base

db = SessionLocal()
try:
    print("Running migrations...")
    # Add rs column to technicals
    db.execute(text("ALTER TABLE technicals ADD COLUMN IF NOT EXISTS rs FLOAT;"))
    
    # Create Base metadata for any missing tables
    Base.metadata.create_all(bind=engine)
    
    db.commit()
    print("Migrations complete!")
except Exception as e:
    print(f"Error during migration: {e}")
    db.rollback()
finally:
    db.close()
