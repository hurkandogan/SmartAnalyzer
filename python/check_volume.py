from database.db import SessionLocal
from database.models import Candle
import pandas as pd
from datetime import datetime

db = SessionLocal()
candles = db.query(Candle).filter(Candle.symbol == 'AAPL').order_by(Candle.date.asc()).all()
if candles:
    df = pd.DataFrame([{"Date": c.date, "Volume": c.volume} for c in candles])
    last_date = df['Date'].iloc[-1]
    is_today = (last_date == datetime.now().date())
    print(f"Last date in DB: {last_date}")
    print(f"Is today: {is_today}")
    
    current_vol_last = df['Volume'].iloc[-1]
    avg_vol_20d_last = df['Volume'].iloc[-20:].mean()
    print(f"If is_today=False -> Current Vol: {current_vol_last}, Avg: {avg_vol_20d_last}")
    
    current_vol_prev = df['Volume'].iloc[-2]
    avg_vol_20d_prev = df['Volume'].iloc[-21:-1].mean()
    print(f"If is_today=True  -> Current Vol: {current_vol_prev}, Avg: {avg_vol_20d_prev}")
