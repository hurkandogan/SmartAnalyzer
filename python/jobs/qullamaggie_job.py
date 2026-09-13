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
        
    # Filter out weekends/holidays with 0 volume
    df = df[df['Volume'] > 0].copy()
    if len(df) < 60:
        return None
        
    current_price = df['Close'].iloc[-1]
    
    # 1. Trend / Surf (0-35 points)
    # Price must be above EMA10, EMA20, SMA50, SMA200
    ema10_series = df['Close'].ewm(span=10, adjust=False).mean()
    current_ema10 = ema10_series.iloc[-1]
    ema10_5d_ago = ema10_series.iloc[-6] if len(ema10_series) >= 6 else current_ema10
    
    current_ema20 = df['Close'].ewm(span=20, adjust=False).mean().iloc[-1]
    current_sma50 = df['Close'].rolling(window=50).mean().iloc[-1]
    
    trend_score = 0
    if current_ema10 >= current_ema20:
        trend_score += 12
    if current_price >= current_ema10:
        trend_score += 10
    if current_price >= current_ema20:
        trend_score += 8
    if current_ema10 > ema10_5d_ago:
        trend_score += 3
    if current_price >= current_sma50:
        trend_score += 2
        
    # 2. RS (0-25 points)
    stock_return_63d = (current_price - df['Close'].iloc[-63]) / df['Close'].iloc[-63] if len(df) >= 63 else 0
    spy_return_63d = (spy_df['Close'].iloc[-1] - spy_df['Close'].iloc[-63]) / spy_df['Close'].iloc[-63] if len(spy_df) >= 63 else 0
    rs_63 = stock_return_63d - spy_return_63d
    
    stock_return_20d = (current_price - df['Close'].iloc[-20]) / df['Close'].iloc[-20] if len(df) >= 20 else 0
    spy_return_20d = (spy_df['Close'].iloc[-1] - spy_df['Close'].iloc[-20]) / spy_df['Close'].iloc[-20] if len(spy_df) >= 20 else 0
    rs_20 = stock_return_20d - spy_return_20d
    
    stock_return_126d = (current_price - df['Close'].iloc[-126]) / df['Close'].iloc[-126] if len(df) >= 126 else 0
    spy_return_126d = (spy_df['Close'].iloc[-1] - spy_df['Close'].iloc[-126]) / spy_df['Close'].iloc[-126] if len(spy_df) >= 126 else 0
    rs_126 = stock_return_126d - spy_return_126d

    rs_score = 0
    if rs_63 > 0: rs_score += 8
    if rs_20 > 0: rs_score += 6
    if rs_126 > 0: rs_score += 4
    
    # 70th and 90th percentile approximations
    # Since we process sequentially, we approximate percentiles with absolute outperformance
    if rs_63 >= 0.10: rs_score += 5  # Beat SPY by 10% (approx 70th percentile)
    if rs_63 >= 0.25: rs_score += 2  # Beat SPY by 25% (approx 90th percentile)
    
    rs_ratio = float((1 + stock_return_63d) / (1 + spy_return_63d))
    
    # For candle-like data (tightness, volume), always use the last CLOSED day.
    # If the last row in df is today's date, we assume it's an incomplete intra-day candle
    # and we use the previous row for closed metrics.
    last_date = df['Date'].iloc[-1] if 'Date' in df.columns else df.index[-1]
    if hasattr(last_date, 'date'):
        last_date_obj = last_date.date()
    else:
        last_date_obj = datetime.strptime(str(last_date)[:10], "%Y-%m-%d").date()
        
    is_today = (last_date_obj == datetime.now().date())
    
    # Base / Tightness (0-20) + flags for hard gates
    df["RangePct"] = (df["High"] - df["Low"]) / df["Close"].replace(0, pd.NA)
    df["RVOL_hist"] = df["Volume"] / df["Volume"].rolling(window=20, min_periods=20).mean().shift(1)
    min_bars = 35
    if len(df) < min_bars:
        is_tight = False
        is_dry = False
        tightness_score = 0
        highs_spread = None
    else:
        if is_today and len(df) > 30:
            recent = slice(-11, -1)
            past = slice(-31, -11)
        else:
            recent = slice(-10, None)
            past = slice(-30, -10)
        recent_10d_range = df["RangePct"].iloc[recent].mean()
        past_20d_range = df["RangePct"].iloc[past].mean()
        recent_10d_median_rvol = df["RVOL_hist"].iloc[recent].median()
        recent_10d_highs = df["High"].iloc[recent]
        is_tight = (
            pd.notna(past_20d_range)
            and pd.notna(recent_10d_range)
            and past_20d_range > 0
            and recent_10d_range > 0
            and recent_10d_range < past_20d_range * 0.75
        )
        is_dry = pd.notna(recent_10d_median_rvol) and (recent_10d_median_rvol <= 0.8)
        above_emas = (current_price >= current_ema10) and (current_price >= current_ema20)
        above_sma50 = True
        if current_sma50 is not None:
            above_sma50 = current_price >= current_sma50
        tightness_score = 0
        if is_tight:
            tightness_score += 8
        if is_dry:
            tightness_score += 7
        if above_emas:
            tightness_score += 3
        mean_high = recent_10d_highs.mean()
        if mean_high and mean_high > 0 and len(recent_10d_highs) >= 8:
            highs_spread = float((recent_10d_highs.max() - recent_10d_highs.min()) / mean_high)
            if highs_spread < 0.04:
                tightness_score += 2
        else:
            highs_spread = None
        if not above_sma50:
            tightness_score = min(tightness_score, 10)
    tightness_score = int(max(0, min(20, tightness_score)))
    
    # Volume & Extension (0-20 points)
    if is_today and len(df) > 20:
        current_vol = float(df['Volume'].iloc[-2])
        avg_vol_20d = float(df['Volume'].iloc[-21:-1].mean())
    else:
        current_vol = float(df['Volume'].iloc[-1])
        avg_vol_20d = float(df['Volume'].iloc[-20:].mean())
    
    rvol = current_vol / avg_vol_20d if avg_vol_20d > 0 else 0
    ext_pct = (current_price - current_ema10) / current_ema10 if current_ema10 > 0 else 0
    # Buy Signal / Momentum Flag (Does NOT add to score)
    # Pivot break (close > recent highs max or near it), RVOL >= 1.5, Trend/RS OK, extPct <= 0.05
    # Use recent_10d_highs properly bounded by length checks above
    recent_max = recent_10d_highs.max() if 'recent_10d_highs' in locals() and len(recent_10d_highs) > 0 else current_price
    is_pivot_break = current_price >= (recent_max * 0.99)
    trend_rs_ok = (current_ema10 >= current_ema20) and (rs_score >= 15)
    
    is_momentum = False
    if is_pivot_break and rvol >= 1.5 and trend_rs_ok and ext_pct <= 0.05:
        is_momentum = True
    
    # Volume Score (0-20 points) - Reverse Scale
    # Penalize high volume on setup day, reward dry volume
    vol_score = 0
    if rvol <= 0.6: vol_score = 20
    elif rvol <= 0.8: vol_score = 16
    elif rvol <= 1.0: vol_score = 12
    elif rvol <= 1.5: vol_score = 6
    elif rvol <= 2.0: vol_score = 2
    else: vol_score = 0
    
    # Earnings Distance (No longer part of total score, just for info)
    earnings_score = 0
    days_to_earnings = 999
    if earnings_date:
        # Convert pandas Timestamp or other to naive datetime for comparison
        if hasattr(earnings_date, 'tz_localize') and earnings_date.tz is not None:
            earnings_date = earnings_date.tz_localize(None)
        days_to_earnings = (earnings_date.date() - datetime.now().date()).days

    total_score = trend_score + rs_score + tightness_score + vol_score
    
    # HARD FILTERS (EMIT rules)
    is_no_setup = False
    
    avg_dollar_vol = avg_vol_20d * current_price
    if avg_dollar_vol < 10_000_000: # 10M
        is_no_setup = True
        
    if days_to_earnings < 7:
        is_no_setup = True
        
    # EMA10 >= EMA20, close >= her ikisi
    if current_ema10 < current_ema20 or current_price < current_ema10 or current_price < current_ema20:
        is_no_setup = True
        
    # extPct <= 5%
    if ext_pct > 0.05:
        is_no_setup = True
        
    # RS >= 15 and rs_63 > 0
    if rs_score < 15 or rs_63 <= 0:
        is_no_setup = True
        
    # Base >= 12 + sıkışma + dry + EMAs
    above_emas_strict = (current_price >= current_ema10) and (current_price >= current_ema20)
    if tightness_score < 12 or not is_tight or not is_dry or not above_emas_strict:
        is_no_setup = True
        
    # Setup RVOL < 1.5
    if not is_momentum and rvol >= 1.5:
        is_no_setup = True
        
    # Ham skor >= 70
    if not is_momentum and total_score < 70:
        is_no_setup = True
        
    status = "no_setup"
    if not is_no_setup:
        # CANDIDATE rules (otherwise WATCH)
        # Skor >= 70, Base >= 15, Trend >= 28
        can_be_candidate = True
        if total_score < 70: can_be_candidate = False
        if tightness_score < 15: can_be_candidate = False
        if trend_score < 28: can_be_candidate = False
        
        # Buy signals cannot be candidate, they are just buy signals in watch (breakout day)
        if is_momentum: can_be_candidate = False
        
        if can_be_candidate:
            status = "candidate"
        else:
            status = "watch"
            
    reason = {
        "trend_score": trend_score,
        "rs_score": rs_score,
        "tightness_score": tightness_score,
        "vol_score": vol_score,
        "rs_ratio": None if pd.isna(rs_ratio) else float(rs_ratio),
        "days_to_earnings": int(days_to_earnings),
        "ext_pct": float(ext_pct),
        "is_momentum": is_momentum,
        "is_tight": bool(is_tight),
        "is_dry": bool(is_dry),
        "highs_spread": float(highs_spread) if highs_spread is not None else None,
        "avg_dollar_vol": None if pd.isna(avg_dollar_vol) else float(avg_dollar_vol)
    }
    
    sma50 = df['Close'].rolling(window=50).mean().iloc[-1]
    sma200 = df['Close'].rolling(window=200).mean().iloc[-1]

    return {
        "score": int(total_score),
        "status": status,
        "reason": json.dumps(reason),
        "ema10": None if pd.isna(current_ema10) else float(current_ema10),
        "ema20": None if pd.isna(current_ema20) else float(current_ema20),
        "sma50": None if pd.isna(sma50) else float(sma50),
        "sma200": None if pd.isna(sma200) else float(sma200),
        "rs": None if pd.isna(rs_ratio) else float(rs_ratio),
        "current_vol": None if pd.isna(current_vol) else float(current_vol),
        "avg_vol_20d": None if pd.isna(avg_vol_20d) else float(avg_vol_20d)
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

        # Fetch Earnings Calendar from Firebase
        earnings_dict = {}
        try:
            from services.firebase import get_db as get_firebase_db
            fdb = get_firebase_db()
            if fdb:
                logger.info("Fetching Earnings Calendar from Firebase...")
                doc = fdb.collection("screener").document("earnings_calendar").get()
                if doc.exists:
                    events = doc.to_dict().get("events", [])
                    for e in events:
                        if e.get("type") == "earnings" and e.get("title") and e.get("date"):
                            try:
                                d_str = e["date"].replace("Z", "+00:00")
                                earnings_dict[e["title"]] = datetime.fromisoformat(d_str)
                            except ValueError:
                                pass
                logger.info(f"Loaded earnings dates for {len(earnings_dict)} symbols from Firebase.")
            else:
                logger.warning("Could not initialize Firebase for earnings. Earnings distances will be missing.")
        except Exception as e:
            logger.error(f"Error fetching earnings from Firebase: {e}")

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
                
                if df is None or df.empty or len(df) < 130:
                    continue
                    
                earnings_date = earnings_dict.get(sym)
                analysis = calculate_qullamaggie(sym, df, spy, earnings_date)
                
                if not analysis:
                    continue
                
                try:
                    import json
                    r = json.loads(analysis["reason"])
                    logger.info(
                        f"[{sym}] Score: {analysis['score']} ({analysis['status']}) | "
                        f"Trend: {r.get('trend_score', 0)}/35 | RS: {r.get('rs_score', 0)}/25 | "
                        f"Base: {r.get('tightness_score', 0)}/20 | Vol: {r.get('vol_score', 0)}/20 | "
                        f"Ext: {r.get('ext_pct', 0):.2f}"
                    )
                except Exception as e:
                    logger.info(f"[{sym}] Score: {analysis['score']} ({analysis['status']})")
                # Save to AnalysisScore unconditionally
                today = datetime.now().date()
                today_start = datetime.combine(today, datetime.min.time())
                existing_score = db.query(AnalysisScore).filter(
                    AnalysisScore.symbol == sym,
                    AnalysisScore.analysis_type == 'qullamaggie',
                    AnalysisScore.created_at >= today_start
                ).first()
                
                current_price = float(df['Close'].iloc[-1]) if not df.empty else None
                
                if existing_score:
                    existing_score.score = analysis["score"]
                    existing_score.status = analysis["status"]
                    existing_score.reason = analysis["reason"]
                    existing_score.price = current_price
                    existing_score.created_at = datetime.now()
                else:
                    new_score = AnalysisScore(
                        symbol=sym,
                        analysis_type='qullamaggie',
                        score=analysis["score"],
                        status=analysis["status"],
                        reason=analysis["reason"],
                        price=current_price,
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
                    existing_tech.sma_50 = analysis["sma50"]
                    existing_tech.sma_200 = analysis["sma200"]
                    existing_tech.rs = analysis["rs"]
                else:
                    new_tech = Technical(
                        symbol=sym,
                        date=today,
                        ema_10=analysis["ema10"],
                        ema_20=analysis["ema20"],
                        sma_50=analysis["sma50"],
                        sma_200=analysis["sma200"],
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
