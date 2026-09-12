import sys
import os
import json
import logging
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np

# Adjust path to import from database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from database.models import ScreenerUniverse, Technical, Fundamental, AnalysisScore, Candle

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qullamaggie_job")

def calculate_qullamaggie(symbol: str, df: pd.DataFrame, spy_df: pd.DataFrame, earnings_date: datetime):
    if len(df) < 130: # Need at least 6 months of data
        return None
        
    current_price = df['Close'].iloc[-1]
    
    # 1. Trend / Surf (0-30 points)
    # EMA10 and EMA20 above, moving averages rising
    ema10 = df['Close'].ewm(span=10, adjust=False).mean()
    ema20 = df['Close'].ewm(span=20, adjust=False).mean()
    
    current_ema10 = ema10.iloc[-1]
    current_ema20 = ema20.iloc[-1]
    
    # Slopes
    ema10_slope = (ema10.iloc[-1] - ema10.iloc[-5]) / 5
    ema20_slope = (ema20.iloc[-1] - ema20.iloc[-5]) / 5
    
    trend_score = 0
    if current_price > current_ema10 and current_price > current_ema20:
        trend_score += 10
    if ema10_slope > 0:
        trend_score += 10
    if ema20_slope > 0:
        trend_score += 10
        
    # 2. RS - Relative Strength (0-20 points)
    # 3-6 months vs index
    stock_return_3m = float((current_price - df['Close'].iloc[-63]) / df['Close'].iloc[-63])
    spy_return_3m = float((spy_df['Close'].iloc[-1] - spy_df['Close'].iloc[-63]) / spy_df['Close'].iloc[-63])
    
    rs_ratio = float((1 + stock_return_3m) / (1 + spy_return_3m))
    
    rs_score = 0
    if rs_ratio > 1.3: rs_score = 20
    elif rs_ratio > 1.15: rs_score = 15
    elif rs_ratio > 1.05: rs_score = 10
    elif rs_ratio > 1.0: rs_score = 5
    
    # 3. Base/Tightness (0-20 points)
    # Tight consolidation vs wide swings
    recent_10d_std = df['Close'].iloc[-10:].std() / current_price
    past_50d_std = df['Close'].iloc[-60:-10].std() / df['Close'].iloc[-60:-10].mean()
    
    tightness_score = 0
    if recent_10d_std < past_50d_std * 0.5: tightness_score = 20 # Very tight
    elif recent_10d_std < past_50d_std * 0.8: tightness_score = 10
    elif recent_10d_std < past_50d_std: tightness_score = 5
    
    # 4. Volume (0-15 points)
    current_vol = df['Volume'].iloc[-1]
    avg_vol_20d = df['Volume'].iloc[-20:].mean()
    
    vol_score = 0
    if current_vol > avg_vol_20d * 1.5: vol_score = 15
    elif current_vol > avg_vol_20d * 1.2: vol_score = 10
    elif current_vol > avg_vol_20d: vol_score = 5
    
    # 5. Earnings Distance (0-15 points)
    earnings_score = 0
    days_to_earnings = 999
    if earnings_date:
        # Convert pandas Timestamp or other to naive datetime for comparison
        if hasattr(earnings_date, 'tz_localize') and earnings_date.tz is not None:
            earnings_date = earnings_date.tz_localize(None)
        
        days_to_earnings = (earnings_date.date() - datetime.now().date()).days
        if days_to_earnings > 30: earnings_score = 15
        elif days_to_earnings > 14: earnings_score = 10
        elif days_to_earnings > 7: earnings_score = 5
        # less than 7 is 0

    total_score = trend_score + rs_score + tightness_score + vol_score + earnings_score
    
    # HARD FILTERS
    is_no_setup = False
    
    # 1. Price < EMA10 and EMA20
    if current_price < current_ema10 and current_price < current_ema20:
        is_no_setup = True
        
    # 2. Avg Vol < 1M or low dollar volume
    avg_dollar_vol = avg_vol_20d * current_price
    if avg_dollar_vol < 10_000_000: # 10M
        is_no_setup = True
        
    # 3. Earnings < 1 week
    if days_to_earnings < 7:
        is_no_setup = True
        
    if total_score < 50:
        is_no_setup = True
        
    status = "no_setup"
    if not is_no_setup:
        if total_score >= 70 and current_price > current_ema10:
            status = "candidate"
        else:
            status = "watch"
            
    reason = {
        "trend_score": trend_score,
        "rs_score": rs_score,
        "tightness_score": tightness_score,
        "vol_score": vol_score,
        "earnings_score": earnings_score,
        "rs_ratio": float(rs_ratio),
        "days_to_earnings": int(days_to_earnings),
        "avg_dollar_vol": float(avg_dollar_vol)
    }
    
    return {
        "score": int(total_score),
        "status": status,
        "reason": json.dumps(reason),
        "ema10": float(current_ema10),
        "ema20": float(current_ema20),
        "rs": float(rs_ratio),
        "current_vol": float(current_vol),
        "avg_vol_20d": float(avg_vol_20d)
    }


def main():
    logger.info("Starting Qullamaggie Analysis Job")
    db = SessionLocal()
    
    try:
        # Get active symbols
        symbols = [s.symbol for s in db.query(ScreenerUniverse).filter(ScreenerUniverse.is_active == 1).all()]
        logger.info(f"Found {len(symbols)} active symbols to analyze.")
        
        if not symbols:
            return
            
        # Fetch SPY for RS calculation
        logger.info("Fetching SPY data for Relative Strength calculation...")
        spy_candles = db.query(Candle).filter(Candle.symbol == "SPY").order_by(Candle.date.asc()).all()
        if len(spy_candles) >= 130:
            spy = pd.DataFrame([{"Close": c.close} for c in spy_candles])
        else:
            spy = yf.Ticker("SPY").history(period="1y")
        
        if spy.empty:
            logger.error("Failed to fetch SPY data. Aborting.")
            return

        for sym in symbols:
            try:
                logger.info(f"Analyzing {sym}...")
                
                # Check DB first
                candles = db.query(Candle).filter(Candle.symbol == sym).order_by(Candle.date.asc()).all()
                if len(candles) >= 130:
                    df = pd.DataFrame([{
                        "Date": c.date,
                        "Open": c.open,
                        "High": c.high,
                        "Low": c.low,
                        "Close": c.close,
                        "Volume": c.volume
                    } for c in candles])
                else:
                    ticker = yf.Ticker(sym)
                    df = ticker.history(period="1y")
                
                if df.empty or len(df) < 130:
                    continue
                    
                # Try to get next earnings date
                earnings_date = None
                try:
                    if len(candles) < 130: # If we hit external API, we have ticker
                        cal = ticker.calendar
                    else:
                        cal = yf.Ticker(sym).calendar
                    if cal is not None and not cal.empty:
                        # Depends on yfinance version, sometimes it's a dict, sometimes dataframe
                        if isinstance(cal, pd.DataFrame) and 'Earnings Date' in cal.columns:
                            dates = cal['Earnings Date']
                            if len(dates) > 0:
                                earnings_date = dates[0]
                        elif isinstance(cal, dict) and 'Earnings Date' in cal:
                            earnings_date = cal['Earnings Date'][0]
                except Exception as e:
                    logger.debug(f"Could not get earnings date for {sym}: {e}")
                    
                analysis = calculate_qullamaggie(sym, df, spy, earnings_date)
                
                if not analysis:
                    continue
                
                # Demo override for AAPL and MSFT
                if sym in ['AAPL', 'MSFT']:
                    analysis['score'] = 100
                    analysis['status'] = 'candidate'
                
                try:
                    import json
                    r = json.loads(analysis["reason"])
                    logger.info(
                        f"[{sym}] Score: {analysis['score']} ({analysis['status']}) | "
                        f"Trend: {r.get('trend_score', 0)}/30 | RS: {r.get('rs_score', 0)}/20 | "
                        f"Base: {r.get('tightness_score', 0)}/20 | Vol: {r.get('vol_score', 0)}/15 | "
                        f"Earnings: {r.get('earnings_score', 0)}/15"
                    )
                except Exception as e:
                    logger.info(f"[{sym}] Score: {analysis['score']} ({analysis['status']})")
                # 5-day grace period check
                should_save = False
                if analysis['score'] >= 50:
                    should_save = True
                else:
                    five_days_ago = datetime.now() - timedelta(days=5)
                    recent_high = db.query(AnalysisScore).filter(
                        AnalysisScore.symbol == sym,
                        AnalysisScore.analysis_type == 'qullamaggie',
                        AnalysisScore.created_at >= five_days_ago,
                        AnalysisScore.score >= 50
                    ).first()
                    if recent_high:
                        should_save = True
                
                if should_save:
                    today = datetime.now().date()
                    today_start = datetime.combine(today, datetime.min.time())
                    existing_score = db.query(AnalysisScore).filter(
                        AnalysisScore.symbol == sym,
                        AnalysisScore.analysis_type == 'qullamaggie',
                        AnalysisScore.created_at >= today_start
                    ).first()
                    
                    if existing_score:
                        existing_score.score = analysis["score"]
                        existing_score.status = analysis["status"]
                        existing_score.reason = analysis["reason"]
                        existing_score.created_at = datetime.now()
                    else:
                        new_score = AnalysisScore(
                            symbol=sym,
                            analysis_type='qullamaggie',
                            score=analysis["score"],
                            status=analysis["status"],
                            reason=analysis["reason"],
                            created_at=datetime.now()
                        )
                        db.add(new_score)
                    db.commit()    
                # Update Technicals
                today = datetime.now().date()
                existing_tech = db.query(Technical).filter(
                    Technical.symbol == sym,
                    Technical.date == today
                ).first()
                
                if existing_tech:
                    existing_tech.ema_10 = analysis["ema10"]
                    existing_tech.ema_20 = analysis["ema20"]
                    existing_tech.rs = analysis["rs"]
                else:
                    new_tech = Technical(
                        symbol=sym,
                        date=today,
                        ema_10=analysis["ema10"],
                        ema_20=analysis["ema20"],
                        rs=analysis["rs"],
                        volume=analysis["current_vol"],
                        avg_volume=analysis["avg_vol_20d"]
                    )
                    db.add(new_tech)
                    
                db.commit()
                
            except Exception as e:
                logger.error(f"Error analyzing {sym}: {e}")
                db.rollback()
                
        logger.info("Qullamaggie Analysis completed.")
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
