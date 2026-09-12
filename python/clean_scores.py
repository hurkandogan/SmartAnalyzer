import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.db import SessionLocal
from database.models import AnalysisScore
from sqlalchemy import text

db = SessionLocal()
try:
    print("Deleting all analysis scores to start fresh...")
    db.query(AnalysisScore).delete()
    db.commit()
    print("Deleted.")
finally:
    db.close()
