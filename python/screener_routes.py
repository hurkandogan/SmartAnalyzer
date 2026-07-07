from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import datetime

from database.db import get_db
from database.models import ScreenerUniverse, Fundamental, JobLog
from pydantic import BaseModel

from services.screener_sync import ScreenerSyncService

router = APIRouter(prefix="/api/screener", tags=["screener"])

class AddUniverseRequest(BaseModel):
    symbols: List[str]
    source_index: str = "Custom"

@router.get("/universe")
def get_universe(db: Session = Depends(get_db)):
    universe = db.query(ScreenerUniverse).all()
    return [{
        "symbol": u.symbol, 
        "source_index": u.source_index, 
        "is_active": u.is_active,
        "con_id": u.con_id,
        "long_name": u.long_name,
        "exchange": u.exchange,
        "currency": u.currency,
        "sector": u.sector,
        "industry": u.industry,
        "subcategory": u.subcategory
    } for u in universe]

@router.post("/universe")
async def add_to_universe(req: AddUniverseRequest, db: Session = Depends(get_db)):
    from main import ibkr_service
    added = []
    failed = []
    already_active = []
    
    # Deduplicate and clean symbols
    clean_symbols = list(dict.fromkeys(sym.upper().strip() for sym in req.symbols if sym.strip()))
    
    for sym in clean_symbols:
        
        # Check if already active in universe
        exists = db.query(ScreenerUniverse).filter(ScreenerUniverse.symbol == sym).first()
        if exists and exists.is_active == 1:
            already_active.append(sym)
            continue
            
        # Validate symbol with IBKR
        details = await ibkr_service.get_contract_details(sym)
        if not details:
            failed.append(sym)
            continue
            
        # If it exists but was inactive, reactivate it and update details
        if exists:
            exists.is_active = 1
            exists.con_id = details.get("conId")
            exists.long_name = details.get("longName")
            exists.exchange = details.get("exchange")
            exists.currency = details.get("currency")
            exists.sector = details.get("category")
            exists.industry = details.get("industry")
            exists.subcategory = details.get("subcategory")
            added.append(sym)
        else:
            new_item = ScreenerUniverse(
                symbol=sym,
                source_index=req.source_index,
                added_at=datetime.utcnow(),
                is_active=1,
                con_id=details.get("conId"),
                long_name=details.get("longName"),
                exchange=details.get("exchange"),
                currency=details.get("currency"),
                sector=details.get("category"),
                industry=details.get("industry"),
                subcategory=details.get("subcategory")
            )
            db.add(new_item)
            added.append(sym)
            
        # Also pre-fill/update sector/industry in Fundamental if we got it
        industry = details.get("industry")
        sector = details.get("category")
        if industry or sector:
            # Check if fundamental entry for today exists
            today = datetime.utcnow().date()
            fund = db.query(Fundamental).filter(Fundamental.symbol == sym, Fundamental.date == today).first()
            if fund:
                fund.sector = sector
                fund.industry = industry
            else:
                new_fund = Fundamental(
                    symbol=sym,
                    date=today,
                    sector=sector,
                    industry=industry
                )
                db.add(new_fund)
                
    db.commit()
    
    if len(added) == 0 and len(failed) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Hisseler eklenemedi. IBKR'da bu semboller bulunamadı: {', '.join(failed)}"
        )
        
    return {
        "status": "success",
        "added": added,
        "failed": failed,
        "already_active": already_active
    }

@router.delete("/universe/{symbol}")
def remove_from_universe(symbol: str, db: Session = Depends(get_db)):
    item = db.query(ScreenerUniverse).filter(ScreenerUniverse.symbol == symbol.upper()).first()
    if item:
        item.is_active = 0
        db.commit()
        return {"status": "success", "message": f"{symbol} dropped from universe."}
    raise HTTPException(status_code=404, detail="Symbol not found")

@router.post("/sync")
async def trigger_sync(chunk_size: int = 50):
    from main import ibkr_service
    sync_service = ScreenerSyncService(ibkr_service=ibkr_service)
    import asyncio
    # Run in background so request doesn't block
    asyncio.create_task(sync_service.sync_chunk(chunk_size=chunk_size))
    return {"status": "success", "message": f"Sync started for {chunk_size} symbols"}

@router.get("/opportunities")
def get_opportunities(min_score: int = 75, db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    
    # We want to get the latest fundamental record for each symbol that has score >= min_score
    # In SQLite, we can just get the most recent ones.
    
    # Query all that have a score >= min_score and order by score desc
    # For a real system we'd filter by latest date. Let's do a simple subquery or just fetch and group in python for safety since SQLite window functions can be tricky.
    
    funds = db.query(Fundamental).filter(
        Fundamental.score >= min_score,
        Fundamental.score.isnot(None)
    ).order_by(Fundamental.score.desc()).all()
    
    # Keep only the latest date per symbol
    latest_funds = {}
    for f in funds:
        if f.symbol not in latest_funds or f.date > latest_funds[f.symbol].date:
            latest_funds[f.symbol] = f
            
    results = []
    for f in latest_funds.values():
        if f.score >= min_score:
            results.append({
                "symbol": f.symbol,
                "score": f.score,
                "pe": f.pe,
                "peg": f.peg,
                "roic": f.roic,
                "roe": f.roe,
                "fcf": f.free_cashflow,
                "net_debt_to_ebitda": f.net_debt_to_ebitda,
                "sector": f.sector,
                "industry": f.industry,
                "market_cap": f.market_cap,
                "performance_1y": f.performance_1y,
                "date": f.date.strftime("%Y-%m-%d")
            })
            
    # Sort by score again
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

@router.get("/heatmap")
def get_heatmap(db: Session = Depends(get_db)):
    # Group latest fundamentals by Sector -> Industry -> Symbol
    funds = db.query(Fundamental).filter(
        Fundamental.sector.isnot(None)
    ).all()
    
    # Keep latest per symbol
    latest_funds = {}
    for f in funds:
        if f.symbol not in latest_funds or f.date > latest_funds[f.symbol].date:
            latest_funds[f.symbol] = f
            
    tree = {}
    for f in latest_funds.values():
        sec = f.sector or "Unknown Sector"
        ind = f.industry or "Unknown Industry"
        if sec not in tree:
            tree[sec] = {}
        if ind not in tree[sec]:
            tree[sec][ind] = []
            
        tree[sec][ind].append({
            "symbol": f.symbol,
            "performance_1y": f.performance_1y or 0,
            "market_cap": f.market_cap or 0
        })
        
    return tree
