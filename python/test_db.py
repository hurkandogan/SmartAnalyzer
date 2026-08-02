from database.db import SessionLocal
from database.models import Fundamental, Candle

db = SessionLocal()
f = db.query(Fundamental).filter(Fundamental.symbol == 'RKLB').count()
c = db.query(Candle).filter(Candle.symbol == 'RKLB').count()
print(f"Fundamentals: {f}, Candles: {c}")
