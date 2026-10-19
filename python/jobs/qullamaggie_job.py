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
from utils.market_time import trading_today, utc_now_naive

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qullamaggie_job")

def calculate_qullamaggie(symbol: str, df: pd.DataFrame, spy_df: pd.DataFrame, earnings_date: datetime):
    if len(df) < 130:  # Need at least 6 months of data
        return None
        
    # Filter out weekends/holidays with 0 volume
    df = df[df['Volume'] > 0].copy()
    if len(df) < 60:
        return None
        
    current_price = float(df['Close'].iloc[-1])
    current_vol = float(df['Volume'].iloc[-1])
    
    # ── 1. Indikatör ve Temel Metrik Hesaplamaları ──────────────
    # Moving Averages
    ema10_series = df['Close'].ewm(span=10, adjust=False).mean()
    current_ema10 = float(ema10_series.iloc[-1])
    ema10_5d_ago = float(ema10_series.iloc[-6]) if len(ema10_series) >= 6 else current_ema10
    
    ema20_series = df['Close'].ewm(span=20, adjust=False).mean()
    current_ema20 = float(ema20_series.iloc[-1])
    ema20_5d_ago = float(ema20_series.iloc[-6]) if len(ema20_series) >= 6 else current_ema20
    
    sma50_series = df['Close'].rolling(window=50).mean()
    current_sma50 = float(sma50_series.iloc[-1]) if pd.notna(sma50_series.iloc[-1]) else None
    
    sma200_series = df['Close'].rolling(window=200).mean()
    current_sma200 = float(sma200_series.iloc[-1]) if pd.notna(sma200_series.iloc[-1]) else None

    # ADR% (20 Günlük Ortalama Günlük Marj)
    adr_series = (df['High'] / df['Low'] - 1.0) * 100
    adr_pct = float(adr_series.tail(20).mean()) if len(adr_series) >= 20 else float(adr_series.mean())
    if pd.isna(adr_pct):
        adr_pct = 0.0

    # Öncü Ralli / Bayrak Direği (Prior Leg-Up / Pole)
    low_63d = float(df['Low'].tail(63).min()) if len(df) >= 63 else float(df['Low'].min())
    high_20d = float(df['High'].tail(20).max()) if len(df) >= 20 else float(df['High'].max())
    pole_return = float((high_20d - low_63d) / low_63d) if low_63d > 0 else 0.0

    # Zirveden Geri Çekilme (Pullback / Drawdown from 20d High)
    drawdown_from_high = float((high_20d - current_price) / high_20d) if high_20d > 0 else 0.0

    # Extension from EMA10
    ext_pct = float((current_price - current_ema10) / current_ema10) if current_ema10 > 0 else 0.0

    # ── 2. Puanlama Matrisi (Toplam 100 Puan) ───────────────────
    # A. Trend & Surf Score (Maks 30 Puan)
    trend_score = 0
    if current_ema10 >= current_ema20:
        trend_score += 10
    if current_price >= current_ema20:
        trend_score += 8
    if current_price >= current_ema10:
        trend_score += 5
    if current_sma50 is not None and current_ema20 > current_sma50 and current_price >= current_sma50:
        trend_score += 5
    if current_ema10 > ema10_5d_ago or current_ema20 > ema20_5d_ago:
        trend_score += 2
    trend_score = min(30, trend_score)

    # B. Relative Strength & Momentum (Leg-Up) Score (Maks 30 Puan)
    stock_return_63d = (current_price - df['Close'].iloc[-63]) / df['Close'].iloc[-63] if len(df) >= 63 else 0.0
    spy_return_63d = (spy_df['Close'].iloc[-1] - spy_df['Close'].iloc[-63]) / spy_df['Close'].iloc[-63] if len(spy_df) >= 63 else 0.0
    rs_63 = stock_return_63d - spy_return_63d

    stock_return_126d = (current_price - df['Close'].iloc[-126]) / df['Close'].iloc[-126] if len(df) >= 126 else 0.0
    spy_return_126d = (spy_df['Close'].iloc[-1] - spy_df['Close'].iloc[-126]) / spy_df['Close'].iloc[-126] if len(spy_df) >= 126 else 0.0
    rs_126 = stock_return_126d - spy_return_126d

    rs_ratio = float((1 + stock_return_63d) / (1 + spy_return_63d)) if (1 + spy_return_63d) != 0 else 1.0

    rs_score = 0
    if pole_return >= 0.50:
        rs_score += 15
    elif pole_return >= 0.30:
        rs_score += 10

    if rs_63 > 0:
        rs_score += 5
    if rs_63 >= 0.15:
        rs_score += 5
    if rs_126 >= 0.20 or rs_63 >= 0.30:
        rs_score += 5
    rs_score = min(30, rs_score)

    # C. Tightness & Consolidation (VCP) Score (Maks 25 Puan)
    range_pct_series = (df['High'] - df['Low']) / df['Close'] * 100
    recent_3d_range = float(range_pct_series.tail(3).mean())
    recent_5d_range = float(range_pct_series.tail(5).mean())

    is_tight = bool((recent_3d_range < (adr_pct * 0.75)) or (recent_5d_range < (adr_pct * 0.80)))
    tightness_score = 0
    if is_tight:
        tightness_score += 10
    if recent_3d_range < (adr_pct * 0.55):
        tightness_score += 5

    valid_base_depth = bool(drawdown_from_high <= 0.15)
    if valid_base_depth:
        tightness_score += 5

    # Pivot / Direnç Yakınlığı (near_pivot):
    pivot_slice = df['High'].iloc[-10:-1] if len(df) >= 11 else df['High'].iloc[:-1]
    pivot_high = float(pivot_slice.max()) if len(pivot_slice) > 0 and pd.notna(pivot_slice.max()) else current_price

    near_pivot = bool((pivot_high - current_price) / pivot_high <= 0.05) if pivot_high > 0 else False
    if near_pivot:
        tightness_score += 5
    tightness_score = min(25, tightness_score)

    # D. Volume Dry-Up Score (Maks 15 Puan)
    avg_vol_20d = float(df['Volume'].tail(20).mean()) if len(df) >= 20 else float(df['Volume'].mean())
    vol_3d_avg = float(df['Volume'].tail(3).mean())
    rvol = float(current_vol / avg_vol_20d) if avg_vol_20d > 0 else 0.0
    rvol_3d = float(vol_3d_avg / avg_vol_20d) if avg_vol_20d > 0 else 0.0

    is_dry = bool((rvol <= 0.85) or (rvol_3d <= 0.85))

    min_rvol = min(rvol, rvol_3d)
    vol_score = 0
    if min_rvol <= 0.60:
        vol_score = 15
    elif min_rvol <= 0.75:
        vol_score = 12
    elif min_rvol <= 0.90:
        vol_score = 9
    elif min_rvol <= 1.10:
        vol_score = 5
    else:
        vol_score = 0
    vol_score = min(15, vol_score)

    total_score = trend_score + rs_score + tightness_score + vol_score

    # Days to earnings
    days_to_earnings = 999
    if earnings_date:
        if hasattr(earnings_date, 'tz_localize') and earnings_date.tz is not None:
            earnings_date = earnings_date.tz_localize(None)
        days_to_earnings = (earnings_date.date() - datetime.now().date()).days

    # ── 3. Katı Eleme Kuralları (Hard Filters / Gates) ───────────
    is_no_setup = False
    avg_dollar_vol = avg_vol_20d * current_price

    if avg_dollar_vol < 10_000_000:
        is_no_setup = True
    if current_price < 5.0:
        is_no_setup = True
    if adr_pct < 4.0:
        is_no_setup = True
    if days_to_earnings < 7:
        is_no_setup = True
    if current_price < (current_ema20 * 0.98):
        is_no_setup = True
    if current_ema10 < (current_ema20 * 0.99):
        is_no_setup = True
    if current_sma50 is not None and current_price < current_sma50:
        is_no_setup = True
    if pole_return < 0.25:
        is_no_setup = True
    if drawdown_from_high > 0.22:
        is_no_setup = True
    if ext_pct > 0.08:
        is_no_setup = True

    # Buyout / M&A Pinning Filter (Ölü Bar Kontrolü)
    tail_10_high = float(df['High'].tail(10).max()) if len(df) >= 10 else float(df['High'].max())
    tail_10_low = float(df['Low'].tail(10).min()) if len(df) >= 10 else float(df['Low'].min())
    ten_day_range_pct = float(((tail_10_high - tail_10_low) / tail_10_low) * 100) if tail_10_low > 0 else 0.0

    is_pinned = bool(recent_5d_range < 1.2 or ten_day_range_pct < 2.5)
    if is_pinned:
        is_no_setup = True

    # ── 4. Statü Sınıflandırması ────────────────────────────────
    is_momentum = bool(
        current_price >= (pivot_high * 0.995)
        and rvol >= 1.3
        and ext_pct <= 0.08
        and rs_score >= 15
    )

    status = "no_setup"
    if not is_no_setup:
        is_candidate = bool(
            total_score >= 70
            and is_tight
            and is_dry
            and not is_momentum
        )
        is_watch = bool(
            not is_candidate
            and (
                is_momentum
                or (
                    total_score >= 65
                    and pole_return >= 0.35
                    and (is_tight or is_dry)
                )
            )
        )

        if is_candidate:
            status = "candidate"
        elif is_watch:
            status = "watch"
        else:
            status = "no_setup"

    final_score = 0 if status == "no_setup" else int(total_score)

    # ── 5. Reason Dict ──────────────────────────────────────────
    reason = {
        "raw_score": int(total_score),
        "pinned_stock": bool(is_pinned),
        "trend_score": int(trend_score),
        "rs_score": int(rs_score),
        "tightness_score": int(tightness_score),
        "vol_score": int(vol_score),
        "rs_ratio": None if pd.isna(rs_ratio) else round(float(rs_ratio), 4),
        "days_to_earnings": int(days_to_earnings),
        "ext_pct": round(float(ext_pct), 4),
        "is_momentum": bool(is_momentum),
        "is_tight": bool(is_tight),
        "is_dry": bool(is_dry),
        "rvol": round(float(rvol), 2),
        "rvol_3d": round(float(rvol_3d), 2),
        "avg_dollar_vol": None if pd.isna(avg_dollar_vol) else round(float(avg_dollar_vol), 2),
        "ema_10": None if pd.isna(current_ema10) else round(float(current_ema10), 2),
        "ema_20": None if pd.isna(current_ema20) else round(float(current_ema20), 2),
        "sma_50": None if pd.isna(current_sma50) else round(float(current_sma50), 2),
        "sma_200": None if pd.isna(current_sma200) else round(float(current_sma200), 2),
        "adr_pct": round(float(adr_pct), 2),
        "pole_return_pct": round(float(pole_return * 100), 2),
        "drawdown_pct": round(float(drawdown_from_high * 100), 2),
        "pivot_high": round(float(pivot_high), 2),
        "stop_loss_lod": round(float(df['Low'].iloc[-1]), 2)
    }

    return {
        "score": final_score,
        "status": status,
        "reason": json.dumps(reason),
        "ema10": None if pd.isna(current_ema10) else float(current_ema10),
        "ema20": None if pd.isna(current_ema20) else float(current_ema20),
        "sma50": None if pd.isna(current_sma50) else float(current_sma50),
        "sma200": None if pd.isna(current_sma200) else float(current_sma200),
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
                        f"Trend: {r.get('trend_score', 0)}/30 | RS: {r.get('rs_score', 0)}/30 | "
                        f"Base: {r.get('tightness_score', 0)}/25 | Vol: {r.get('vol_score', 0)}/15 | "
                        f"ADR: {r.get('adr_pct', 0):.2f}% | Pole: {r.get('pole_return_pct', 0):.1f}% | Ext: {r.get('ext_pct', 0):.2f}"
                    )
                except Exception as e:
                    logger.info(f"[{sym}] Score: {analysis['score']} ({analysis['status']})")
                # Save to AnalysisScore unconditionally
                session_date = trading_today()
                existing_score = db.query(AnalysisScore).filter(
                    AnalysisScore.symbol == sym,
                    AnalysisScore.analysis_type == 'qullamaggie',
                    AnalysisScore.as_of_date == session_date
                ).first()
                
                current_price = float(df['Close'].iloc[-1]) if not df.empty else None
                
                if existing_score:
                    existing_score.score = analysis["score"]
                    existing_score.status = analysis["status"]
                    existing_score.reason = analysis["reason"]
                    existing_score.price = current_price
                    existing_score.created_at = utc_now_naive()
                else:
                    new_score = AnalysisScore(
                        symbol=sym,
                        analysis_type='qullamaggie',
                        score=analysis["score"],
                        status=analysis["status"],
                        reason=analysis["reason"],
                        price=current_price,
                        created_at=utc_now_naive(),
                        as_of_date=session_date
                    )
                    db.add(new_score)
                db.commit()
                # Update Technicals
                existing_tech = db.query(Technical).filter(
                    Technical.symbol == sym,
                    Technical.date == session_date
                ).first()
                
                if existing_tech:
                    existing_tech.ema_10 = analysis["ema10"]
                    existing_tech.ema_20 = analysis["ema20"]
                    existing_tech.sma_50 = analysis["sma50"]
                    existing_tech.sma_200 = analysis["sma200"]
                    existing_tech.rs = analysis["rs"]
                    existing_tech.volume = analysis["current_vol"]
                    existing_tech.avg_volume = analysis["avg_vol_20d"]
                else:
                    new_tech = Technical(
                        symbol=sym,
                        date=session_date,
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
