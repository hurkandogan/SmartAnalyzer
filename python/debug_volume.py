import os
import sys
sys.path.append("/home/hurkan/Desktop/projects/SmartAnalyser/python")
from database.db import SessionLocal
from database.models import Candle
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

load_dotenv("/home/hurkan/Desktop/projects/SmartAnalyser/.env")
db = SessionLocal()

# Check AAPL
candles = db.query(Candle).filter(Candle.symbol == 'AAPL').order_by(Candle.date.asc()).all()
if candles:
    df = pd.DataFrame([{"Date": c.date, "Volume": c.volume} for c in candles])
    df = df[df['Volume'] > 0].copy()
    
    last_date = df['Date'].iloc[-1] if 'Date' in df.columns else df.index[-1]
    if hasattr(last_date, 'date'):
        last_date_obj = last_date.date()
    else:
        last_date_obj = datetime.strptime(str(last_date)[:10], "%Y-%m-%d").date()
    
    is_today = (last_date_obj == datetime.now().date())
    
    if is_today and len(df) > 20:
        current_vol = float(df['Volume'].iloc[-2])
        avg_vol_20d = float(df['Volume'].iloc[-21:-1].mean())
    else:
        current_vol = float(df['Volume'].iloc[-1])
        avg_vol_20d = float(df['Volume'].iloc[-20:].mean())

    print(f"AAPL - Last Date: {last_date_obj}, is_today: {is_today}")
    print(f"current_vol: {current_vol}, avg_vol_20d: {avg_vol_20d}")
    print(f"Ratio: {current_vol / avg_vol_20d if avg_vol_20d > 0 else 0}")
    
    print("\nLast 5 volumes:")
    print(df['Volume'].tail(5))
    
    print("\nPrevious 20 volumes:")
    print(df['Volume'].iloc[-20:].tolist())
