import sys
import os
import logging
from datetime import datetime
import json
import traceback

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from database.models import Fundamental, CompanyProfile, AnalysisScore, Technical, Candle
from sqlalchemy import func

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] fundamentals_job: %(message)s")
logger = logging.getLogger("fundamentals_job")

def calculate_fund_score(f: Fundamental, cp: CompanyProfile, t: Technical, c: Candle) -> dict:
    """
    Calculates fundScore (0-100) and wheelFit based purely on DB data.
    """
    score = 0
    breakdown = {
        "growth": 0,       # Max 30
        "profitability": 0, # Max 25
        "balance_sheet": 0, # Max 25
        "size_liquidity": 0,# Max 10
        "risk_penalty": 0   # Max -10
    }
    
    # 1. Growth (30)
    rev_growth = getattr(f, 'revenue_growth_yoy', 0) or 0
    if rev_growth > 0.20:
        breakdown["growth"] += 30
    elif rev_growth > 0.10:
        breakdown["growth"] += 20
    elif rev_growth > 0:
        breakdown["growth"] += 10
        
    # 2. Profitability (25)
    net_margin = getattr(f, 'net_margin', 0) or 0
    if net_margin > 0.20:
        breakdown["profitability"] += 15
    elif net_margin > 0.10:
        breakdown["profitability"] += 10
    elif net_margin > 0:
        breakdown["profitability"] += 5
        
    fcf = getattr(f, 'free_cashflow', 0) or 0
    if fcf > 0:
        breakdown["profitability"] += 10
        
    # 3. Balance Sheet (25)
    net_debt = getattr(f, 'net_debt', 0) or 0
    if net_debt < 0:
        # More cash than debt
        breakdown["balance_sheet"] += 15
    elif net_debt == 0:
        breakdown["balance_sheet"] += 10
    else:
        # Has net debt, check debt to equity
        de_ratio = getattr(f, 'debt_to_equity', 100) or 100
        if de_ratio < 1.0:
            breakdown["balance_sheet"] += 5
            
    current_ratio = getattr(f, 'current_ratio', 0) or 0
    if current_ratio > 1.5:
        breakdown["balance_sheet"] += 10
    elif current_ratio > 1.0:
        breakdown["balance_sheet"] += 5
        
    # 4. Size & Liquidity (10)
    market_cap = getattr(f, 'market_cap', 0) or 0
    if market_cap > 10_000_000_000: # > $10B Large cap
        breakdown["size_liquidity"] += 10
    elif market_cap > 2_000_000_000: # > $2B Mid cap
        breakdown["size_liquidity"] += 5
        
    # 5. Risk Penalty (-10)
    # High leverage penalty
    if net_debt > 0:
        ebitda = getattr(f, 'ebitda', 1) or 1
        if ebitda > 0:
            net_debt_to_ebitda = net_debt / ebitda
            if net_debt_to_ebitda > 4.0:
                breakdown["risk_penalty"] -= 10
        else:
            breakdown["risk_penalty"] -= 10 # High debt, negative ebitda
            
    total_score = sum(breakdown.values())
    total_score = max(0, min(100, total_score))
    
    # WheelFit Logic (pass / warn / fail)
    wheel_fit = "pass"
    avg_vol = getattr(t, 'avg_volume', 0) or 0
    price = getattr(c, 'close', 0) or 0
    dollar_vol = avg_vol * price
    
    if dollar_vol < 10_000_000 or price < 5:
        wheel_fit = "fail"
    elif net_debt > 0 and (getattr(f, 'ebitda', 0) or 0) <= 0:
        wheel_fit = "warn"
    elif (getattr(f, 'debt_to_equity', 0) or 0) > 3.0:
        wheel_fit = "warn"
    
    return {
        "score": total_score,
        "wheel_fit": wheel_fit,
        "breakdown": breakdown,
        "sector": getattr(cp, 'sector', "N/A") if cp else "N/A",
        "market_cap_bucket": "Mega/Large" if market_cap > 10e9 else "Mid" if market_cap > 2e9 else "Small",
        "market_cap": market_cap,
        "pe_ratio": getattr(f, 'pe_ratio', None),
        "peg_ratio": getattr(f, 'peg_ratio', None),
        "revenue_growth": rev_growth,
        "net_margin": net_margin,
        "has_net_cash": net_debt < 0,
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
            candle = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).first()
            
            if not candle or not tech:
                continue
                
            try:
                analysis = calculate_fund_score(fund, cp, tech, candle)
                
                today = datetime.utcnow().date()
                existing = db.query(AnalysisScore).filter(
                    AnalysisScore.symbol == symbol,
                    AnalysisScore.analysis_type == 'fundamentals',
                    func.date(AnalysisScore.created_at) == today
                ).first()
                
                reason_json = json.dumps(analysis)
                
                if existing:
                    existing.score = analysis["score"]
                    existing.status = analysis["wheel_fit"]
                    existing.reason = reason_json
                    existing.price = candle.close
                else:
                    new_score = AnalysisScore(
                        symbol=symbol,
                        analysis_type='fundamentals',
                        score=analysis["score"],
                        status=analysis["wheel_fit"],
                        reason=reason_json,
                        price=candle.close,
                        created_at=datetime.utcnow()
                    )
                    db.add(new_score)
                count += 1
            except Exception as e:
                logger.error(f"Error calculating score for {symbol}: {e}")
                
        db.commit()
        logger.info(f"Successfully processed {count} fundamental analyses.")
        
    except Exception as e:
        logger.error(f"Fatal error in fundamentals job: {e}")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
