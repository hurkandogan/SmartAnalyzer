from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import datetime

from database.db import get_db
from database.models import ScreenerUniverse, Fundamental, JobLog
from pydantic import BaseModel



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



@router.get("/opportunities")
def get_opportunities(min_score: int = 75, db: Session = Depends(get_db)):
    from database.models import Technical
    
    techs = db.query(Technical).filter(
        Technical.score >= min_score,
        Technical.score.isnot(None)
    ).order_by(Technical.score.desc()).all()
    
    latest_techs = {}
    for t in techs:
        if t.symbol not in latest_techs or t.date > latest_techs[t.symbol].date:
            latest_techs[t.symbol] = t
            
    symbols = list(latest_techs.keys())
    universe_data = {}
    if symbols:
        universe_items = db.query(ScreenerUniverse).filter(ScreenerUniverse.symbol.in_(symbols)).all()
        for item in universe_items:
            universe_data[item.symbol] = item
            
    results = []
    for t in latest_techs.values():
        sym = t.symbol
        f = db.query(Fundamental).filter(Fundamental.symbol == sym, Fundamental.date == t.date).first()
        u = universe_data.get(sym)
        
        results.append({
            "symbol": sym,
            "score": t.score,
            "pe": f.pe if f else None,
            "peg": f.peg if f else None,
            "roic": f.roic if f else None,
            "roe": f.roe if f else None,
            "fcf": f.free_cashflow if f else None,
            "net_debt_to_ebitda": f.net_debt_to_ebitda if f else None,
            "sector": u.sector if u else None,
            "industry": u.industry if u else None,
            "market_cap": f.market_cap if f else None,
            "performance_1y": t.performance_1y,
            "date": t.date.strftime("%Y-%m-%d")
        })
            
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

@router.get("/heatmap")
def get_heatmap(db: Session = Depends(get_db)):
    from database.models import Technical
    
    universe = db.query(ScreenerUniverse).filter(
        ScreenerUniverse.is_active == 1,
        ScreenerUniverse.sector.isnot(None)
    ).all()
    
    tree = {}
    for u in universe:
        sym = u.symbol
        sec = u.sector or "Unknown Sector"
        ind = u.industry or "Unknown Industry"
        
        t = db.query(Technical).filter(Technical.symbol == sym).order_by(Technical.date.desc()).first()
        f = db.query(Fundamental).filter(Fundamental.symbol == sym).order_by(Fundamental.date.desc()).first()
        
        if sec not in tree:
            tree[sec] = {}
        if ind not in tree[sec]:
            tree[sec][ind] = []
            
        tree[sec][ind].append({
            "symbol": sym,
            "performance_1y": t.performance_1y if t else 0,
            "market_cap": f.market_cap if f else 0
        })
        
    return tree
