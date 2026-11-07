import os
import sys
import json
import time
import logging
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor
import yfinance as yf
import pandas as pd
import numpy as np
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] market_status_job: %(message)s")
logger = logging.getLogger("market_status_job")

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/smart_analyser")

INDEX_CONFIG = [
    {
        "symbol": "QQQ",
        "name": "Invesco QQQ (Nasdaq 100)",
        "short_name": "Nasdaq 100",
        "role": "Growth & Tech Leaders Compass",
    },
    {
        "symbol": "SPY",
        "name": "SPDR S&P 500 ETF",
        "short_name": "S&P 500",
        "role": "Broad Cap-Weighted Market",
    },
    {
        "symbol": "RSP",
        "name": "Invesco S&P 500 Equal Weight",
        "short_name": "S&P Equal Weight",
        "role": "True Market Participation (Breadth ETF)",
    },
    {
        "symbol": "IWM",
        "name": "iShares Russell 2000 ETF",
        "short_name": "Russell 2000",
        "role": "Small-Cap & Speculative Risk Appetite",
    },
]

MACRO_OPTION_TICKERS = [
    "^VIX",
    "^VIX9D",
    "^VIX3M",
    "HYG",
    "TLT",
    "^TNX",
    "DX-Y.NYB",
]


def safe_round(val, digits=2):
    if val is None:
        return None
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return None
        return round(f, digits)
    except Exception:
        return None


def analyze_index_series(df: pd.DataFrame, meta: dict) -> dict:
    """Computes live MAs, slopes, distances, and traffic light for an index ETF."""
    if df is None or df.empty:
        return {
            **meta,
            "price": None,
            "light": "yellow",
            "status_label": "No Data",
        }

    closes = df["Close"].dropna()
    if len(closes) < 20:
        return {
            **meta,
            "price": safe_round(closes.iloc[-1]) if len(closes) else None,
            "light": "yellow",
            "status_label": "Insufficient History",
        }

    ema10_s = closes.ewm(span=10, adjust=False).mean()
    ema20_s = closes.ewm(span=20, adjust=False).mean()
    sma50_s = closes.rolling(50).mean()
    sma200_s = closes.rolling(200).mean()

    price = float(closes.iloc[-1])
    prev_close = float(closes.iloc[-2]) if len(closes) >= 2 else price
    close_5d_ago = float(closes.iloc[-6]) if len(closes) >= 6 else prev_close

    change_1d_pct = ((price - prev_close) / prev_close) * 100.0 if prev_close else 0.0
    change_5d_pct = ((price - close_5d_ago) / close_5d_ago) * 100.0 if close_5d_ago else 0.0

    ema10 = float(ema10_s.iloc[-1])
    ema20 = float(ema20_s.iloc[-1])
    sma50 = float(sma50_s.iloc[-1]) if not np.isnan(sma50_s.iloc[-1]) else ema20
    sma200 = float(sma200_s.iloc[-1]) if len(closes) >= 200 and not np.isnan(sma200_s.iloc[-1]) else sma50

    ema10_5d_ago = float(ema10_s.iloc[-6]) if len(ema10_s) >= 6 else ema10
    ema20_5d_ago = float(ema20_s.iloc[-6]) if len(ema20_s) >= 6 else ema20
    sma50_5d_ago = float(sma50_s.iloc[-6]) if len(sma50_s) >= 6 and not np.isnan(sma50_s.iloc[-6]) else sma50

    ema10_slope_pct = ((ema10 - ema10_5d_ago) / ema10_5d_ago) * 100.0 if ema10_5d_ago else 0.0
    ema20_slope_pct = ((ema20 - ema20_5d_ago) / ema20_5d_ago) * 100.0 if ema20_5d_ago else 0.0
    sma50_slope_pct = ((sma50 - sma50_5d_ago) / sma50_5d_ago) * 100.0 if sma50_5d_ago else 0.0

    above_ema10 = price > ema10
    above_ema20 = price > ema20
    above_sma50 = price > sma50
    above_sma200 = price > sma200
    ema10_gt_ema20 = ema10 > ema20
    ema20_rising = ema20_slope_pct >= -0.05

    dist_ema10_pct = ((price - ema10) / ema10) * 100.0
    dist_ema20_pct = ((price - ema20) / ema20) * 100.0
    dist_sma50_pct = ((price - sma50) / sma50) * 100.0
    dist_sma200_pct = ((price - sma200) / sma200) * 100.0

    # Traffic Light Logic (Qullamaggie Index Rules)
    if above_ema10 and above_ema20 and ema10_gt_ema20 and above_sma50:
        light = "green"
        status_label = "Full Bull Surf (Price > EMA10 > EMA20 > SMA50)"
        short_status = "BULL SURF"
        score = 95 if above_sma200 else 82
    elif above_ema20 and ema10_gt_ema20:
        light = "green"
        status_label = "Early Surf / Holding EMA20"
        short_status = "EARLY SURF"
        score = 78 if above_sma200 else 70
    elif above_sma50 and (above_ema20 or ema10_gt_ema20):
        light = "yellow"
        status_label = "Pullback to EMA20/SMA50 Support"
        short_status = "PULLBACK / SUPPORT"
        score = 58
    elif above_sma50 or (above_sma200 and dist_ema20_pct > -2.5):
        light = "yellow"
        status_label = "Choppy / Testing Key Support"
        short_status = "CHOP / CAUTION"
        score = 45
    else:
        light = "red"
        if not above_sma200 and not above_sma50:
            status_label = "Bearish Downtrend (Below EMA10/20, SMA50 & SMA200)"
            short_status = "DEEP BEAR"
            score = 15
        else:
            status_label = "Correction Mode (Below EMA10, EMA20 & SMA50)"
            short_status = "CORRECTION"
            score = 25

    return {
        **meta,
        "price": safe_round(price),
        "change_1d_pct": safe_round(change_1d_pct),
        "change_5d_pct": safe_round(change_5d_pct),
        "ema10": safe_round(ema10),
        "ema20": safe_round(ema20),
        "sma50": safe_round(sma50),
        "sma200": safe_round(sma200),
        "ema10_slope_pct": safe_round(ema10_slope_pct),
        "ema20_slope_pct": safe_round(ema20_slope_pct),
        "sma50_slope_pct": safe_round(sma50_slope_pct),
        "dist_ema10_pct": safe_round(dist_ema10_pct),
        "dist_ema20_pct": safe_round(dist_ema20_pct),
        "dist_sma50_pct": safe_round(dist_sma50_pct),
        "dist_sma200_pct": safe_round(dist_sma200_pct),
        "above_ema10": bool(above_ema10),
        "above_ema20": bool(above_ema20),
        "above_sma50": bool(above_sma50),
        "above_sma200": bool(above_sma200),
        "ema10_gt_ema20": bool(ema10_gt_ema20),
        "ema20_rising": bool(ema20_rising),
        "light": light,
        "status_label": status_label,
        "short_status": short_status,
        "health_score": score,
    }


def fetch_live_market_and_options_data():
    """Fetches 1y daily + live intraday quotes for indices and macro/options indicators."""
    all_tickers = [m["symbol"] for m in INDEX_CONFIG] + MACRO_OPTION_TICKERS
    data = yf.download(all_tickers, period="1y", group_by="ticker", threads=True, progress=False)

    indices = {}
    for meta in INDEX_CONFIG:
        sym = meta["symbol"]
        df = data[sym] if sym in data else pd.DataFrame()
        indices[sym] = analyze_index_series(df, meta)

    # Calculate Equal-Weight (RSP) vs Cap-Weight (SPY & QQQ) Rotation
    rsp = indices.get("RSP", {})
    spy = indices.get("SPY", {})
    qqq = indices.get("QQQ", {})

    rsp_spy_1d = safe_round((rsp.get("change_1d_pct") or 0) - (spy.get("change_1d_pct") or 0))
    rsp_spy_5d = safe_round((rsp.get("change_5d_pct") or 0) - (spy.get("change_5d_pct") or 0))
    rsp_qqq_5d = safe_round((rsp.get("change_5d_pct") or 0) - (qqq.get("change_5d_pct") or 0))

    if rsp.get("above_sma50") and not qqq.get("above_sma50"):
        rotation_light = "yellow"
        rotation_title = "Defensive / Value Rotation (RSP Outperforming Tech)"
        rotation_desc = "Equal-weight S&P 500 (RSP) is holding above SMA50 while Nasdaq (QQQ) is below SMA50. Mega-cap tech is under distribution while broader non-tech stocks are showing resilience."
    elif rsp.get("above_ema20") and qqq.get("above_ema20") and spy.get("above_ema20"):
        rotation_light = "green"
        rotation_title = "Broad Bull Participation (RSP + SPY + QQQ Aligned)"
        rotation_desc = "Both equal-weight (RSP) and cap-weight indices (SPY/QQQ) are surfing above EMA20. High-probability environment for breakout continuation."
    elif not rsp.get("above_ema20") and qqq.get("above_ema20"):
        rotation_light = "yellow"
        rotation_title = "Narrow Mega-Cap Market (QQQ Up, RSP Lagging)"
        rotation_desc = "Index gains are concentrated in mega-cap leaders while average stocks (RSP) lag below EMA20. Keep breakout selection ultra-tight."
    else:
        rotation_light = "red"
        rotation_title = "Broad Market Selling Pressure (Both RSP & QQQ Weak)"
        rotation_desc = "Selling pressure is hitting both mega-caps and equal-weight stocks. Protect capital and wait for EMA10/20 reclaim."

    rotation = {
        "rsp_vs_spy_1d_pct": rsp_spy_1d,
        "rsp_vs_spy_5d_pct": rsp_spy_5d,
        "rsp_vs_qqq_5d_pct": rsp_qqq_5d,
        "light": rotation_light,
        "title": rotation_title,
        "description": rotation_desc,
    }

    # Macro & Options Volatility Analysis
    def extract_series_stats(ticker_sym):
        if ticker_sym not in data:
            return None
        s = data[ticker_sym]["Close"].dropna()
        if len(s) < 5:
            return None
        last = float(s.iloc[-1])
        prev = float(s.iloc[-2]) if len(s) >= 2 else last
        chg1d = ((last - prev) / prev) * 100.0 if prev else 0.0
        ema20 = float(s.ewm(span=20, adjust=False).mean().iloc[-1])
        sma50 = float(s.rolling(50).mean().iloc[-1]) if len(s) >= 50 else ema20
        return {
            "price": safe_round(last),
            "change_1d_pct": safe_round(chg1d),
            "ema20": safe_round(ema20),
            "sma50": safe_round(sma50),
            "above_ema20": bool(last > ema20),
            "above_sma50": bool(last > sma50),
        }

    vix_stats = extract_series_stats("^VIX") or {"price": 20.0, "change_1d_pct": 0.0, "ema20": 18.0, "above_ema20": True}
    vix9d_stats = extract_series_stats("^VIX9D") or {"price": vix_stats["price"], "change_1d_pct": 0.0}
    vix3m_stats = extract_series_stats("^VIX3M") or {"price": vix_stats["price"] * 1.05, "change_1d_pct": 0.0}
    hyg_stats = extract_series_stats("HYG") or {"price": 78.0, "change_1d_pct": 0.0, "ema20": 78.0, "above_ema20": True}
    tlt_stats = extract_series_stats("TLT") or {"price": 90.0, "change_1d_pct": 0.0, "ema20": 90.0, "above_ema20": False}
    tnx_stats = extract_series_stats("^TNX") or {"price": 4.2, "change_1d_pct": 0.0, "ema20": 4.2, "above_ema20": False}
    dxy_stats = extract_series_stats("DX-Y.NYB") or {"price": 103.0, "change_1d_pct": 0.0, "ema20": 103.0, "above_ema20": False}

    vix_val = vix_stats["price"] or 20.0
    vix9d_val = vix9d_stats["price"] or vix_val
    vix3m_val = vix3m_stats["price"] or (vix_val * 1.05)

    term_ratio = safe_round(vix_val / vix3m_val, 3) if vix3m_val else 1.0
    short_term_ratio = safe_round(vix9d_val / vix_val, 3) if vix_val else 1.0

    # VIX Term Structure: Contango (VIX < VIX3M) vs Backwardation (VIX >= VIX3M)
    if term_ratio >= 1.02 or short_term_ratio >= 1.08:
        term_light = "red"
        term_state = "BACKWARDATION (Acute Fear / Hedge Panic)"
        term_desc = "Short-term volatility (VIX / VIX9D) has spiked above 3-month VIX3M. Institutional desks are paying a premium for immediate crash protection."
    elif term_ratio >= 0.95:
        term_light = "yellow"
        term_state = "FLAT / CAUTION CURVE"
        term_desc = "VIX is approaching VIX3M (ratio near 1.0). Hedging demand is rising; expect wider intraday swings."
    else:
        term_light = "green"
        term_state = "CONTANGO (Normal Calm Structure)"
        term_desc = "VIX is comfortably below 3-month VIX3M. No acute institutional panic in the options market."

    # VIX Level & Options Strategy Selector
    if vix_val < 16.5:
        vix_light = "green"
        vix_regime = "LOW VOLATILITY (Cheap Options Premium)"
        options_playbook = "FAVOR BUYING PREMIUM: Long Calls/Puts, Calendar Spreads, or Vertical Debit Spreads. Implied volatility is cheap; avoid selling naked premium for thin credit."
        options_mode_badge = "DEBIT / LONG PREMIUM"
    elif vix_val <= 22.0:
        vix_light = "yellow"
        vix_regime = "MODERATE VOLATILITY (Balanced Pricing)"
        options_playbook = "FAVOR WHEEL & DIRECTIONAL SPREADS: Cash-Secured Puts on Tier-1 Wheel stocks at EMA20/SMA50 support, Covered Calls, or Defined-Risk Credit Spreads."
        options_mode_badge = "WHEEL & CREDIT SPREADS"
    else:
        vix_light = "red"
        vix_regime = "HIGH VOLATILITY / FEAR (Rich Options Premium)"
        options_playbook = "FAVOR SELLING PREMIUM (PREMIUM HARVESTING): IV is rich! Avoid buying expensive naked calls/puts (IV crush risk). Sell OTM Cash-Secured Puts on high-quality Wheel stocks or Credit Spreads once VIX peaks."
        options_mode_badge = "SELL PREMIUM / HARVEST IV"

    # Credit Appetite (HYG)
    if hyg_stats["above_ema20"] and hyg_stats["above_sma50"]:
        credit_light = "green"
        credit_status = "Risk-On Credit (HYG > EMA20 & SMA50)"
        credit_desc = "High-yield corporate bonds are trending above EMA20. Smart-money credit markets confirm equity risk appetite."
    elif hyg_stats["above_sma50"]:
        credit_light = "yellow"
        credit_status = "Neutral Credit (HYG Pullback)"
        credit_desc = "High-yield bonds slipped below EMA20 but hold SMA50. Watch for credit divergence."
    else:
        credit_light = "red"
        credit_status = "Risk-Off Credit Stress (HYG < EMA20 & SMA50)"
        credit_desc = "Smart-money bond markets are pricing in risk aversion. Equity rallies face higher failure rates until HYG reclaims EMA20."

    options_macro = {
        "vix": {
            **vix_stats,
            "light": vix_light,
            "regime": vix_regime,
            "options_mode_badge": options_mode_badge,
            "options_playbook": options_playbook,
        },
        "term_structure": {
            "vix9d": safe_round(vix9d_val),
            "vix": safe_round(vix_val),
            "vix3m": safe_round(vix3m_val),
            "vix_to_vix3m_ratio": term_ratio,
            "vix9d_to_vix_ratio": short_term_ratio,
            "light": term_light,
            "state": term_state,
            "description": term_desc,
        },
        "credit_hyg": {
            **hyg_stats,
            "light": credit_light,
            "status": credit_status,
            "description": credit_desc,
        },
        "rates_and_fx": {
            "tnx_10y": tnx_stats,
            "tlt_bonds": tlt_stats,
            "dxy_dollar": dxy_stats,
        },
    }

    return indices, rotation, options_macro


def compute_database_breadth_and_setups():
    """Computes 1,618-stock internal breadth, 4-color distribution, 14d trajectory, sector breadth, and active setups."""
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. 14-day daily breadth history + latest snapshot
            cur.execute("""
                SELECT
                    date::text AS date,
                    COUNT(*) AS total_stocks,
                    COUNT(*) FILTER (WHERE close > ema_10) AS above_ema10_count,
                    COUNT(*) FILTER (WHERE close > ema_20) AS above_ema20_count,
                    COUNT(*) FILTER (WHERE ema_10 > ema_20) AS ema10_gt_ema20_count,
                    COUNT(*) FILTER (WHERE close > sma_50) AS above_sma50_count,
                    COUNT(*) FILTER (WHERE close > sma_200) AS above_sma200_count,
                    -- 4-Zone Stock Classification:
                    -- Green (Full Bull Surf): Close > EMA10 AND EMA10 > EMA20 AND Close > SMA50
                    COUNT(*) FILTER (
                        WHERE close > ema_10 AND ema_10 > ema_20 AND close > sma_50
                    ) AS green_bull_surf_count,
                    -- Cyan (Early Surf / Turnaround Zone): Close > EMA20 AND EMA10 > EMA20 AND Close <= SMA50
                    COUNT(*) FILTER (
                        WHERE close > ema_20 AND ema_10 > ema_20 AND close <= sma_50
                    ) AS cyan_early_surf_count,
                    -- Yellow (Pullback / Consolidation): Above either EMA20 or SMA50, but not in Green or Cyan surf
                    COUNT(*) FILTER (
                        WHERE (close > sma_50 OR close > ema_20)
                          AND NOT (close > ema_10 AND ema_10 > ema_20 AND close > sma_50)
                          AND NOT (close > ema_20 AND ema_10 > ema_20 AND close <= sma_50)
                    ) AS yellow_pullback_count,
                    -- Red (Bear / Broken): Close <= EMA20 AND Close <= SMA50
                    COUNT(*) FILTER (
                        WHERE close <= ema_20 AND close <= sma_50
                    ) AS red_bear_count
                FROM candles
                WHERE date >= CURRENT_DATE - INTERVAL '30 days'
                  AND ema_20 IS NOT NULL
                  AND sma_50 IS NOT NULL
                GROUP BY date
                HAVING COUNT(*) >= 500
                ORDER BY date DESC
                LIMIT 14
            """)
            daily_rows = cur.fetchall()

            if not daily_rows:
                raise RuntimeError("No candle breadth rows found in database")

            latest = daily_rows[0]
            prev_1d = daily_rows[1] if len(daily_rows) >= 2 else latest
            prev_5d = daily_rows[min(5, len(daily_rows) - 1)]

            def row_to_metrics(r):
                tot = max(1, int(r["total_stocks"]))
                return {
                    "date": r["date"],
                    "total_stocks": tot,
                    "above_ema10_count": int(r["above_ema10_count"]),
                    "above_ema20_count": int(r["above_ema20_count"]),
                    "ema10_gt_ema20_count": int(r["ema10_gt_ema20_count"]),
                    "above_sma50_count": int(r["above_sma50_count"]),
                    "above_sma200_count": int(r["above_sma200_count"]),
                    "pct_above_ema10": round(100.0 * int(r["above_ema10_count"]) / tot, 1),
                    "pct_above_ema20": round(100.0 * int(r["above_ema20_count"]) / tot, 1),
                    "pct_ema10_gt_ema20": round(100.0 * int(r["ema10_gt_ema20_count"]) / tot, 1),
                    "pct_above_sma50": round(100.0 * int(r["above_sma50_count"]) / tot, 1),
                    "pct_above_sma200": round(100.0 * int(r["above_sma200_count"]) / tot, 1),
                    "green_bull_surf_count": int(r["green_bull_surf_count"]),
                    "cyan_early_surf_count": int(r["cyan_early_surf_count"]),
                    "yellow_pullback_count": int(r["yellow_pullback_count"]),
                    "red_bear_count": int(r["red_bear_count"]),
                    "green_bull_surf_pct": round(100.0 * int(r["green_bull_surf_count"]) / tot, 1),
                    "cyan_early_surf_pct": round(100.0 * int(r["cyan_early_surf_count"]) / tot, 1),
                    "yellow_pullback_pct": round(100.0 * int(r["yellow_pullback_count"]) / tot, 1),
                    "red_bear_pct": round(100.0 * int(r["red_bear_count"]) / tot, 1),
                }

            history_14d = [row_to_metrics(r) for r in reversed(daily_rows)]
            curr_m = row_to_metrics(latest)
            prev1_m = row_to_metrics(prev_1d)
            prev5_m = row_to_metrics(prev_5d)

            delta_1d_ema10_pct = round(curr_m["pct_above_ema10"] - prev1_m["pct_above_ema10"], 1)
            delta_1d_ema20_pct = round(curr_m["pct_above_ema20"] - prev1_m["pct_above_ema20"], 1)
            delta_5d_ema20_pct = round(curr_m["pct_above_ema20"] - prev5_m["pct_above_ema20"], 1)
            net_ema10_stocks_1d = curr_m["above_ema10_count"] - prev1_m["above_ema10_count"]
            net_ema20_stocks_1d = curr_m["above_ema20_count"] - prev1_m["above_ema20_count"]

            # Breadth Thrust / Tsunami Alert
            if delta_1d_ema10_pct <= -10.0 or delta_1d_ema20_pct <= -8.0:
                thrust_light = "red"
                thrust_state = "TSUNAMI BREADTH DROP"
                thrust_desc = f"{abs(net_ema10_stocks_1d)} stocks lost their EMA10 in a single session ({delta_1d_ema10_pct:+.1f}%). Broad institutional distribution wave — expect high breakout failure rate."
            elif delta_1d_ema10_pct >= 10.0 or delta_1d_ema20_pct >= 8.0:
                thrust_light = "green"
                thrust_state = "BREADTH THRUST SURGE"
                thrust_desc = f"+{net_ema10_stocks_1d} stocks reclaimed EMA10 in a single session ({delta_1d_ema10_pct:+.1f}%). Powerful institutional accumulation wave across the universe."
            elif curr_m["pct_above_ema20"] >= 58.0 and delta_5d_ema20_pct >= 0:
                thrust_light = "green"
                thrust_state = "HEALTHY EXPANDING BREADTH"
                thrust_desc = f"{curr_m['pct_above_ema20']}% of universe is above EMA20 with positive 5-day momentum ({delta_5d_ema20_pct:+.1f}%)."
            elif curr_m["pct_above_ema20"] >= 45.0:
                thrust_light = "yellow"
                thrust_state = "MIXED / SELECTIVE BREADTH"
                thrust_desc = f"{curr_m['pct_above_ema20']}% of stocks hold EMA20 (1D change: {delta_1d_ema20_pct:+.1f}%). Market internals are split; focus only on top RS & Phase 1/2 setups."
            else:
                thrust_light = "red"
                thrust_state = "WEAK / CONTRACTING BREADTH"
                thrust_desc = f"Only {curr_m['pct_above_ema20']}% of stocks are above EMA20. Most stocks are in downtrends; preserve cash."

            # Overall Breadth Traffic Light
            if curr_m["pct_above_ema20"] >= 58.0 and curr_m["pct_above_sma50"] >= 52.0 and delta_1d_ema10_pct > -8.0:
                breadth_light = "green"
            elif curr_m["pct_above_ema20"] >= 45.0 and delta_1d_ema10_pct > -12.0:
                breadth_light = "yellow"
            else:
                breadth_light = "red"

            # 2. Sector Breadth Leaderboard (which sectors are surfing vs bleeding)
            cur.execute("""
                WITH latest_candles AS (
                    SELECT DISTINCT ON (symbol)
                        symbol, close, ema_10, ema_20, sma_50, sma_200
                    FROM candles
                    WHERE ema_20 IS NOT NULL
                    ORDER BY symbol, date DESC
                )
                SELECT
                    COALESCE(NULLIF(su.sector, ''), 'Other') AS sector,
                    COUNT(*) AS total,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE lc.close > lc.ema_20) / COUNT(*), 1) AS pct_above_ema20,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE lc.close > lc.sma_50) / COUNT(*), 1) AS pct_above_sma50,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE lc.close > lc.ema_10 AND lc.ema_10 > lc.ema_20 AND lc.close > lc.sma_50) / COUNT(*), 1) AS bull_surf_pct
                FROM latest_candles lc
                JOIN screener_universe su ON su.symbol = lc.symbol
                WHERE su.is_active = 1
                  AND su.sector IS NOT NULL
                  AND su.sector <> ''
                GROUP BY su.sector
                HAVING COUNT(*) >= 12
                ORDER BY pct_above_ema20 DESC, bull_surf_pct DESC
            """)
            sector_rows = [
                {
                    "sector": r["sector"],
                    "total": int(r["total"]),
                    "pct_above_ema20": float(r["pct_above_ema20"]),
                    "pct_above_sma50": float(r["pct_above_sma50"]),
                    "bull_surf_pct": float(r["bull_surf_pct"]),
                    "light": "green" if float(r["pct_above_ema20"]) >= 60 else ("yellow" if float(r["pct_above_ema20"]) >= 45 else "red"),
                }
                for r in cur.fetchall()
            ]

            # 3. Active Strategy Setups & Options Wheel Readiness from latest analysis_scores
            cur.execute("""
                WITH latest_scores AS (
                    SELECT DISTINCT ON (symbol, analysis_type)
                        symbol, analysis_type, score, status, reason, price, COALESCE(as_of_date, created_at::date) AS dt
                    FROM analysis_scores
                    ORDER BY symbol, analysis_type, COALESCE(as_of_date, created_at::date) DESC, created_at DESC
                ),
                max_dates AS (
                    SELECT analysis_type, MAX(dt) AS max_dt
                    FROM latest_scores
                    GROUP BY analysis_type
                )
                SELECT ls.symbol, ls.analysis_type, ls.score, ls.status, ls.reason, ls.price, ls.dt::text
                FROM latest_scores ls
                JOIN max_dates md ON md.analysis_type = ls.analysis_type AND ls.dt = md.max_dt
            """)
            score_rows = cur.fetchall()

            qulla_candidates = 0
            qulla_watch = 0
            qulla_sweetspot = 0

            es_candidates = 0
            es_watch = 0
            es_sweetspot = 0
            es_phase1 = 0
            es_phase2 = 0

            wheel_pass_total = 0

            for r in score_rows:
                atype = r["analysis_type"]
                st = r["status"]
                sc = float(r["score"] or 0)
                reason = r["reason"]
                if isinstance(reason, str):
                    try:
                        reason = json.loads(reason)
                    except Exception:
                        reason = {}
                elif not isinstance(reason, dict):
                    reason = {}

                if atype == "qullamaggie" and st in ("candidate", "watch") and sc > 0:
                    if st == "candidate":
                        qulla_candidates += 1
                    else:
                        qulla_watch += 1
                    if 70 <= sc <= 88:
                        qulla_sweetspot += 1

                elif atype == "early_surf" and st in ("candidate", "watch") and sc > 0:
                    if st == "candidate":
                        es_candidates += 1
                    else:
                        es_watch += 1
                    if 70 <= sc <= 88:
                        es_sweetspot += 1
                    phase = reason.get("surf_phase") or (reason.get("metrics") or {}).get("surf_phase") or ""
                    if "phase_1" in str(phase):
                        es_phase1 += 1
                    elif "phase_2" in str(phase):
                        es_phase2 += 1

                elif atype == "fundamentals":
                    if reason.get("wheel_fit") == "pass":
                        wheel_pass_total += 1

            # 4. Universe Implied Volatility (IV) & Wheel + Trend Overlap
            cur.execute("""
                WITH latest_tech AS (
                    SELECT DISTINCT ON (symbol)
                        symbol,
                        CASE WHEN iv <= 5 THEN iv * 100.0 ELSE iv END AS iv_pct,
                        rsi,
                        rvol
                    FROM technicals
                    WHERE iv IS NOT NULL AND iv > 0
                    ORDER BY symbol, date DESC
                )
                SELECT
                    COUNT(*) AS iv_count,
                    ROUND(AVG(iv_pct)::numeric, 1) AS avg_iv,
                    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY iv_pct)::numeric, 1) AS median_iv,
                    COUNT(*) FILTER (WHERE iv_pct >= 35 AND iv_pct <= 75) AS prime_option_iv_count
                FROM latest_tech
            """)
            iv_row = cur.fetchone() or {}

            breadth_data = {
                **curr_m,
                "delta_1d_ema10_pct": delta_1d_ema10_pct,
                "delta_1d_ema20_pct": delta_1d_ema20_pct,
                "delta_5d_ema20_pct": delta_5d_ema20_pct,
                "net_ema10_stocks_1d": net_ema10_stocks_1d,
                "net_ema20_stocks_1d": net_ema20_stocks_1d,
                "light": breadth_light,
                "thrust_light": thrust_light,
                "thrust_state": thrust_state,
                "thrust_description": thrust_desc,
                "history_14d": history_14d,
                "sector_breadth": sector_rows,
            }

            setups_summary = {
                "qullamaggie": {
                    "active_total": qulla_candidates + qulla_watch,
                    "candidates": qulla_candidates,
                    "watch": qulla_watch,
                    "sweet_spot_70_88": qulla_sweetspot,
                },
                "early_surf": {
                    "active_total": es_candidates + es_watch,
                    "candidates": es_candidates,
                    "watch": es_watch,
                    "sweet_spot_70_88": es_sweetspot,
                    "phase_1_pre_cross": es_phase1,
                    "phase_2_bridge_cross": es_phase2,
                },
                "options_wheel": {
                    "wheel_fit_pass_count": wheel_pass_total,
                    "universe_median_iv_pct": float(iv_row.get("median_iv") or 0.0),
                    "universe_avg_iv_pct": float(iv_row.get("avg_iv") or 0.0),
                    "prime_iv_35_75_count": int(iv_row.get("prime_option_iv_count") or 0),
                },
            }

            return breadth_data, setups_summary
    finally:
        conn.close()


def compute_overall_regime(indices: dict, rotation: dict, breadth: dict, options_macro: dict) -> dict:
    """Combines Index Trend, Internal Breadth, and Options/Credit into a Master Traffic Light & Action Plan."""
    qqq = indices.get("QQQ", {})
    spy = indices.get("SPY", {})
    rsp = indices.get("RSP", {})
    iwm = indices.get("IWM", {})

    # 1. Index Pillar Score (0-40)
    idx_raw = (
        (qqq.get("health_score", 50) * 0.35)
        + (spy.get("health_score", 50) * 0.25)
        + (rsp.get("health_score", 50) * 0.25)
        + (iwm.get("health_score", 50) * 0.15)
    )
    index_pillar = round((idx_raw / 100.0) * 40.0, 1)

    # 2. Breadth Pillar Score (0-35)
    pct_e20 = breadth.get("pct_above_ema20", 50.0)
    pct_s50 = breadth.get("pct_above_sma50", 50.0)
    d1_e10 = breadth.get("delta_1d_ema10_pct", 0.0)

    b_score = (pct_e20 * 0.5 + pct_s50 * 0.5)
    if d1_e10 <= -10.0:
        b_score -= 20.0
    elif d1_e10 >= 10.0:
        b_score += 12.0
    b_score = max(0.0, min(100.0, b_score))
    breadth_pillar = round((b_score / 100.0) * 35.0, 1)

    # 3. Volatility & Credit Pillar Score (0-25)
    vix_light = options_macro["vix"]["light"]
    term_light = options_macro["term_structure"]["light"]
    cred_light = options_macro["credit_hyg"]["light"]

    l_map = {"green": 100.0, "yellow": 55.0, "red": 15.0}
    vc_raw = (
        l_map.get(vix_light, 50.0) * 0.35
        + l_map.get(term_light, 50.0) * 0.35
        + l_map.get(cred_light, 50.0) * 0.30
    )
    vol_credit_pillar = round((vc_raw / 100.0) * 25.0, 1)

    total_score = round(index_pillar + breadth_pillar + vol_credit_pillar, 1)

    # Master Traffic Light Decision
    tsunami = breadth.get("delta_1d_ema10_pct", 0) <= -10.0
    qqq_spy_both_red = qqq.get("light") == "red" and spy.get("light") == "red"

    if total_score >= 65.0 and not tsunami and not qqq_spy_both_red:
        overall_light = "green"
        regime_code = "FULL_BULL_SURF"
        regime_title = "BULL SURF ENVIRONMENT — GREEN LIGHT"
        headline = "Indices and internal market breadth are aligned upward. High-probability environment for swing breakouts and Early Surf entries."
        max_positions = "4 – 5 Positions (Full Deployment)"
        risk_per_trade = "1.0% Equity per Trade (1R)"
        swing_playbook = "Focus on Day-1 Candidate upgrades (Score 70–88) in Phase 1/2 Early Surf and tight Qullamaggie flags. Trail winners with EMA20 (-0.5%)."
    elif total_score >= 42.0 and not (qqq_spy_both_red and breadth.get("pct_above_ema20", 50) < 48):
        overall_light = "yellow"
        regime_code = "SELECTIVE_ROTATION_CHOP"
        regime_title = "SELECTIVE / ROTATION MODE — YELLOW LIGHT"
        if rsp.get("above_sma50") and not qqq.get("above_sma50"):
            headline = "Cap-weighted tech (QQQ/SPY) is under pressure below EMA20/SMA50, while Equal-Weight S&P 500 (RSP) and 52% of internal stocks hold support."
        else:
            headline = "Mixed market internals or sharp single-day breadth pullback. Breakouts face higher intraday whipsaw risk."
        max_positions = "1 – 2 Positions Max (Half Exposure)"
        risk_per_trade = "0.5% Equity per Trade (0.5R)"
        swing_playbook = "Avoid extended breakouts (90+ score) and lagging tech if QQQ < EMA20. Only take A+ Early Surf Phase 1/2 turnarounds in leading sectors with tight EMA20 stops."
    else:
        overall_light = "red"
        regime_code = "DEFENSIVE_CORRECTION"
        regime_title = "DEFENSIVE / CORRECTION MODE — RED LIGHT"
        headline = "Major indices (QQQ/SPY) are below falling EMA10 & EMA20 or internal breadth suffered a heavy distribution wave. Breakout failure rate is high."
        max_positions = "0 – 1 Position (Cash is King)"
        risk_per_trade = "0.25% Pilot Only or 100% Cash"
        swing_playbook = "Protect capital! Do not force swing breakouts while QQQ & SPY trade below falling EMA10/EMA20. Wait for EMA10/20 reclaim or harvest elevated options premium on Wheel stocks."

    return {
        "overall_light": overall_light,
        "regime_code": regime_code,
        "regime_title": regime_title,
        "composite_score": total_score,
        "pillars": {
            "index_trend_score": index_pillar,
            "index_trend_max": 40,
            "breadth_score": breadth_pillar,
            "breadth_max": 35,
            "vol_credit_score": vol_credit_pillar,
            "vol_credit_max": 25,
        },
        "headline": headline,
        "action_plan": {
            "max_positions": max_positions,
            "risk_per_trade": risk_per_trade,
            "swing_playbook": swing_playbook,
            "options_playbook": options_macro["vix"]["options_playbook"],
            "options_mode_badge": options_macro["vix"]["options_mode_badge"],
        },
    }


def generate_market_status_payload() -> dict:
    t0 = time.time()
    indices, rotation, options_macro = fetch_live_market_and_options_data()
    breadth, setups = compute_database_breadth_and_setups()
    regime = compute_overall_regime(indices, rotation, breadth, options_macro)

    elapsed = round(time.time() - t0, 2)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "compute_duration_sec": elapsed,
        "latest_candle_date": breadth.get("date"),
        "regime": regime,
        "indices": indices,
        "rotation": rotation,
        "breadth": breadth,
        "options_macro": options_macro,
        "setups": setups,
    }


if __name__ == "__main__":
    payload = generate_market_status_payload()
    print("__MARKET_STATUS_JSON_START__")
    print(json.dumps(payload))
    print("__MARKET_STATUS_JSON_END__")
