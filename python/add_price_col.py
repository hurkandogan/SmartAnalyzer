import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.db import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE analysis_scores ADD COLUMN IF NOT EXISTS price NUMERIC;"))
        conn.commit()
        print("Successfully added price column.")
except Exception as e:
    print(f"Error: {e}")
