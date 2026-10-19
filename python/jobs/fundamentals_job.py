import sys
import os
import logging
from datetime import datetime
import json
import traceback

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'))

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from database.models import Fundamental, CompanyProfile, AnalysisScore, Technical, Candle
from utils.market_time import trading_today, utc_now_naive
from sqlalchemy import func

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] fundamentals_job: %(message)s")
logger = logging.getLogger("fundamentals_job")

def calculate_fund_score(
    f: Fundamental, 
    cp: CompanyProfile, 
    t: Technical, 
    c: Candle,
    up_down_vol_ratio: float = 1.0,
    prev_rev_growth: float = None
) -> dict:
    """
    Calculates 100-point Fundamental Score and WheelFit based on DB data:
    1. Büyüme & İvmelenme (Growth & Acceleration): Max 35 pts
    2. Kurumsal Para Girişi (Institutional Up/Down Volume): Max 20 pts
    3. Kârlılık & Nakit Akışı (Profitability & Cash Flow): Max 25 pts
    4. Bilanço Gücü (Balance Sheet & Solvency): Max 20 pts
    5. Risk Cezaları (Leverage Penalties): Max -10 pts
    """
    breakdown = {
        "growth": 0,          # Max 35
        "accumulation": 0,    # Max 20
        "profitability": 0,   # Max 25
        "balance_sheet": 0,   # Max 20
        "risk_penalty": 0     # Max -10
    }
    
    # 1. Büyüme & İvmelenme (Max 35 Puan)
    rev_growth = getattr(f, 'revenue_growth_yoy', None)
    if rev_growth is not None:
        if rev_growth >= 0.25:
            breakdown["growth"] += 25
        elif rev_growth >= 0.15:
            breakdown["growth"] += 18
        elif rev_growth >= 0.05:
            breakdown["growth"] += 10
        elif rev_growth > 0:
            breakdown["growth"] += 5
            
        # İvmelenme (Growth Acceleration) - Önceki çeyreğe göre büyüme artışı
        if prev_rev_growth is not None and rev_growth > prev_rev_growth:
            breakdown["growth"] += 10
        elif prev_rev_growth is None and rev_growth >= 0.20:
            # Önceki veri yoksa ancak mevcut büyüme güçlü (%20+) ise ivme kredisi
            breakdown["growth"] += 5

    # 2. Kurumsal Para Girişi / Hacim Toplama (Max 20 Puan)
    # 50 günlük Up/Down Volume Ratio (IBD / O'Neil Institutional Accumulation)
    if up_down_vol_ratio >= 1.30:
        breakdown["accumulation"] += 20
    elif up_down_vol_ratio >= 1.10:
        breakdown["accumulation"] += 12
    elif up_down_vol_ratio >= 0.95:
        breakdown["accumulation"] += 5
    elif up_down_vol_ratio < 0.85:
        # Kurumsal satış / Dağıtım baskısı
        breakdown["accumulation"] -= 5

    # 3. Kârlılık & Nakit Akışı (Max 25 Puan)
    net_margin = getattr(f, 'net_margin', None)
    if net_margin is not None:
        if net_margin >= 0.20:
            breakdown["profitability"] += 10
        elif net_margin >= 0.10:
            breakdown["profitability"] += 7
        elif net_margin > 0:
            breakdown["profitability"] += 4

    op_margin = getattr(f, 'operating_margin', None)
    if op_margin is not None and op_margin >= 0.15:
        breakdown["profitability"] += 5

    fcf = getattr(f, 'free_cashflow', None)
    if fcf is not None and fcf > 0:
        breakdown["profitability"] += 10

    # 4. Bilanço Gücü & Likidite (Max 20 Puan)
    net_debt = getattr(f, 'net_debt', None)
    total_cash = getattr(f, 'total_cash', None)
    total_debt = getattr(f, 'total_debt', None)
    has_net_cash = False
    
    if net_debt is not None:
        has_net_cash = net_debt < 0
    elif total_cash is not None and total_debt is not None:
        has_net_cash = total_cash > total_debt

    if has_net_cash:
        breakdown["balance_sheet"] += 10
    else:
        de_ratio = getattr(f, 'debt_to_equity', None)
        if de_ratio is not None and de_ratio < 1.0:
            breakdown["balance_sheet"] += 5

    current_ratio = getattr(f, 'current_ratio', None)
    if current_ratio is not None:
        if current_ratio >= 1.5:
            breakdown["balance_sheet"] += 10
        elif current_ratio >= 1.0:
            breakdown["balance_sheet"] += 5

    # 5. Risk Cezaları (Max -10 Puan)
    if net_debt is not None and net_debt > 0:
        ebitda = getattr(f, 'ebitda', None)
        if ebitda is not None:
            if ebitda <= 0:
                breakdown["risk_penalty"] -= 10
            elif (net_debt / ebitda) > 4.0:
                breakdown["risk_penalty"] -= 10

    raw_score = sum(breakdown.values())
    total_score = max(0, min(100, raw_score))
    
    # WheelFit Mantığı (pass / warn / fail)
    wheel_fit = "pass"
    avg_vol = getattr(t, 'avg_volume', 0) or 0
    price = getattr(c, 'close', 0) or 0
    dollar_vol = avg_vol * price
    
    if dollar_vol < 10_000_000 or price < 5:
        wheel_fit = "fail"
    elif net_debt is not None and net_debt > 0 and (getattr(f, 'ebitda', 0) or 0) <= 0:
        wheel_fit = "warn"
    elif (getattr(f, 'debt_to_equity', 0) or 0) > 3.0:
        wheel_fit = "warn"
    
    market_cap = getattr(f, 'market_cap', 0) or 0
    
    return {
        "score": total_score,
        "wheel_fit": wheel_fit,
        "breakdown": breakdown,
        "sector": getattr(cp, 'sector', "N/A") if cp else "N/A",
        "market_cap_bucket": "Mega/Large" if market_cap > 10e9 else "Mid" if market_cap > 2e9 else "Small",
        "market_cap": market_cap,
        "pe_ratio": getattr(f, 'pe', None),
        "peg_ratio": getattr(f, 'peg', None),
        "revenue_growth": rev_growth,
        "prev_rev_growth": prev_rev_growth,
        "is_accelerating": (prev_rev_growth is not None and rev_growth is not None and rev_growth > prev_rev_growth),
        "net_margin": net_margin,
        "operating_margin": op_margin,
        "has_net_cash": has_net_cash,
        "up_down_vol_ratio": up_down_vol_ratio,
        "dollar_vol": dollar_vol
    }

def main():
    logger.info("Starting Fundamentals Analysis Job")
    
    db = SessionLocal()
    try:
        # Get latest fundamentals
        subq = db.query(
            Fundamental.symbol,
            func.max(Fundamental.date).label('max_date')
        ).group_by(Fundamental.symbol).subquery()
        
        latest_funds = db.query(Fundamental).join(
            subq,
            (Fundamental.symbol == subq.c.symbol) & (Fundamental.date == subq.c.max_date)
        ).all()
        
        logger.info(f"Found {len(latest_funds)} symbols with fundamental data.")
        
        count = 0
        for fund in latest_funds:
            symbol = fund.symbol
            
            cp = db.query(CompanyProfile).filter(CompanyProfile.symbol == symbol).first()
            tech = db.query(Technical).filter(Technical.symbol == symbol).order_by(Technical.date.desc()).first()
            
            # Fetch last 51 candles to compute Up/Down Volume Ratio (last 50 sessions)
            candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(51).all()
            if not candles or not tech:
                continue
                
            candle = candles[0]
            
            # Calculate 50-day Up/Down Volume Ratio
            up_down_ratio = 1.0
            if len(candles) > 1:
                up_vol = sum(c.volume for i, c in enumerate(candles[:-1]) if c.close and candles[i+1].close and c.close > candles[i+1].close)
                down_vol = sum(c.volume for i, c in enumerate(candles[:-1]) if c.close and candles[i+1].close and c.close < candles[i+1].close)
                up_down_ratio = round(up_vol / (down_vol or 1.0), 2)
                
            # Check historical revenue growth for acceleration detection (older by >= 60 days)
            prev_rev_growth = None
            if fund.date:
                from datetime import timedelta
                prev_fund = db.query(Fundamental.revenue_growth_yoy).filter(
                    Fundamental.symbol == symbol,
                    Fundamental.date <= fund.date - timedelta(days=60),
                    Fundamental.revenue_growth_yoy != None
                ).order_by(Fundamental.date.desc()).first()
                if prev_fund:
                    prev_rev_growth = prev_fund[0]
            
            try:
                analysis = calculate_fund_score(
                    f=fund, 
                    cp=cp, 
                    t=tech, 
                    c=candle,
                    up_down_vol_ratio=up_down_ratio,
                    prev_rev_growth=prev_rev_growth
                )
                
                session_date = trading_today()
                existing = db.query(AnalysisScore).filter(
                    AnalysisScore.symbol == symbol,
                    AnalysisScore.analysis_type == 'fundamentals',
                    AnalysisScore.as_of_date == session_date
                ).first()
                
                reason_json = json.dumps(analysis)
                
                if existing:
                    existing.score = analysis["score"]
                    existing.status = analysis["wheel_fit"]
                    existing.reason = reason_json
                    existing.price = candle.close
                    existing.created_at = utc_now_naive()
                else:
                    new_score = AnalysisScore(
                        symbol=symbol,
                        analysis_type='fundamentals',
                        score=analysis["score"],
                        status=analysis["wheel_fit"],
                        reason=reason_json,
                        price=candle.close,
                        created_at=utc_now_naive(),
                        as_of_date=session_date
                    )
                    db.add(new_score)
                count += 1
                if count % 100 == 0:
                    db.commit()
            except Exception as e:
                logger.error(f"Error calculating score for {symbol}: {e}")
                db.rollback()
                
        db.commit()
        logger.info(f"Successfully processed {count} fundamental analyses.")
        
    except Exception as e:
        logger.error(f"Fatal error in fundamentals job: {e}")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
