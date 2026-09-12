import pandas as pd
import numpy as np
from datetime import datetime
import asyncio
import logging
from sqlalchemy import select
from database.db import SessionLocal
from database.models import Candle
from services.ibkr import IBKRService

logger = logging.getLogger("smart_analyser.indicators")

async def _ensure_data(symbol: str, min_candles: int, db) -> pd.DataFrame:
    """
    Ensures that we have at least `min_candles` for the given symbol in the DB.
    If not, it connects to IBKR, fetches 1Y of historical daily candles, saves them, and returns the DataFrame.
    """
    stmt = select(Candle).where(Candle.symbol == symbol).order_by(Candle.date.asc())
    candles = db.execute(stmt).scalars().all()
    
    if len(candles) >= min_candles:
        df = pd.DataFrame([{
            'date': c.date, 'open': c.open, 'high': c.high, 'low': c.low, 'close': c.close, 'volume': c.volume
        } for c in candles])
        df.set_index('date', inplace=True)
        return df

    logger.info(f"[{symbol}] Insufficient data (has {len(candles)}, needs {min_candles}). Fetching from IBKR...")
    
    ibkr = IBKRService()
    try:
        await ibkr.connect()
        bars = await ibkr.get_historical_candles(symbol, duration="1 Y", bar_size="1 day")
        
        if not bars:
            logger.warning(f"[{symbol}] IBKR returned no historical data.")
            return pd.DataFrame()
            
        existing_dates = {c.date for c in candles}
        new_candles = []
        
        for bar in bars:
            try:
                b_date = datetime.strptime(str(bar['date']), "%Y-%m-%d").date()
            except ValueError:
                continue
                
            if b_date not in existing_dates:
                new_c = Candle(
                    symbol=symbol,
                    date=b_date,
                    open=bar['open'],
                    high=bar['high'],
                    low=bar['low'],
                    close=bar['close'],
                    volume=bar['volume']
                )
                new_candles.append(new_c)
                
        if new_candles:
            db.add_all(new_candles)
            db.commit()
            logger.info(f"[{symbol}] Saved {len(new_candles)} new candles to DB.")
            
        candles = db.execute(stmt).scalars().all()
        df = pd.DataFrame([{
            'date': c.date, 'open': c.open, 'high': c.high, 'low': c.low, 'close': c.close, 'volume': c.volume
        } for c in candles])
        if not df.empty:
            df.set_index('date', inplace=True)
        return df
        
    except Exception as e:
        logger.error(f"[{symbol}] Error fetching fallback data from IBKR: {e}")
        return pd.DataFrame()
    finally:
        ibkr.disconnect()

async def get_ema(symbol: str, period: int = 10, db=None) -> float:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        df = await _ensure_data(symbol, min_candles=period*2, db=db)
        if df.empty or len(df) < period:
            return None
            
        ema = df['close'].ewm(span=period, adjust=False).mean()
        val = ema.iloc[-1]
        return None if pd.isna(val) else float(val)
    finally:
        if close_db:
            db.close()

async def get_sma(symbol: str, period: int = 50, db=None) -> float:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        df = await _ensure_data(symbol, min_candles=period, db=db)
        if df.empty or len(df) < period:
            return None
            
        sma = df['close'].rolling(window=period).mean()
        val = sma.iloc[-1]
        return None if pd.isna(val) else float(val)
    finally:
        if close_db:
            db.close()

async def get_rsi(symbol: str, period: int = 14, db=None) -> float:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        df = await _ensure_data(symbol, min_candles=period*2, db=db)
        if df.empty or len(df) < period:
            return None
            
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        val = rsi.iloc[-1]
        return None if pd.isna(val) else float(val)
    finally:
        if close_db:
            db.close()

async def get_volume_metrics(symbol: str, period: int = 20, db=None) -> dict:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        df = await _ensure_data(symbol, min_candles=period, db=db)
        if df.empty or len(df) < period:
            return {"current_vol": None, "avg_vol": None, "rvol": None}
            
        current_vol = df['volume'].iloc[-1]
        avg_vol = df['volume'].iloc[-period:].mean()
        rvol = current_vol / avg_vol if avg_vol > 0 else 0
        
        return {
            "current_vol": None if pd.isna(current_vol) else float(current_vol),
            "avg_vol": None if pd.isna(avg_vol) else float(avg_vol),
            "rvol": None if pd.isna(rvol) else float(rvol)
        }
    finally:
        if close_db:
            db.close()

async def get_rs_ratio(symbol: str, benchmark: str = 'SPY', period_days: int = 63, db=None) -> float:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        stock_df = await _ensure_data(symbol, min_candles=period_days + 10, db=db)
        bench_df = await _ensure_data(benchmark, min_candles=period_days + 10, db=db)
        
        if stock_df.empty or bench_df.empty or len(stock_df) < period_days or len(bench_df) < period_days:
            return None
            
        try:
            stock_return = (stock_df['close'].iloc[-1] - stock_df['close'].iloc[-period_days]) / stock_df['close'].iloc[-period_days]
            bench_return = (bench_df['close'].iloc[-1] - bench_df['close'].iloc[-period_days]) / bench_df['close'].iloc[-period_days]
            
            rs_ratio = (1 + stock_return) / (1 + bench_return)
            return None if pd.isna(rs_ratio) else float(rs_ratio)
        except Exception as e:
            logger.error(f"Error calculating RS Ratio for {symbol}: {e}")
            return None
    finally:
        if close_db:
            db.close()
