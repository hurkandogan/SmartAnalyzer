import os
import logging
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Depends
from pydantic import BaseModel
from dotenv import load_dotenv

# Import services
from services.ibkr import IBKRService
from services.yahoo import YahooService
from services.kraken import KrakenService
from services.analytics import AnalyticsService
from services.sync import SyncService
from services.macro import MacroService
from sqlalchemy.orm import Session
from database.db import get_db

# Load environment variables
load_dotenv(dotenv_path="../.env")

# Setup logging
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("logs/app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("smart_analyser.main")

logging.getLogger("yfinance").setLevel(logging.CRITICAL)

class IBKRFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        if "10091" in msg or "2104" in msg:
            return False
        return True

logging.getLogger("ib_insync.wrapper").addFilter(IBKRFilter())

app = FastAPI(title="SmartAnalyser Python Bridge", version="3.0.0")

from screener_routes import router as screener_router
app.include_router(screener_router)

yahoo_service = YahooService()

kraken_service = KrakenService(
    api_key=os.getenv("KRAKEN_API_KEY", ""),
    api_secret=os.getenv("KRAKEN_API_SECRET", "")
)

analytics_service = AnalyticsService()

def get_sync_service():
    # ibkr_service is globally set during startup
    return SyncService(ibkr_service, yahoo_service, analytics_service)


class CheckCandle(BaseModel):
    date: str
    close: float

class AnalyzeRequest(BaseModel):
    symbols: List[str]
    cached_candles: Dict[str, CheckCandle] = {}  # symbol -> CheckCandle for split checking

class LogRequest(BaseModel):
    level: str
    source: str
    message: str
    details: Optional[str] = None

class MineTickerRequest(BaseModel):
    symbol: str

ibkr_service = None

@app.on_event("startup")
async def startup_event():
    import asyncio
    asyncio.set_event_loop(asyncio.get_running_loop())
    global ibkr_service
    ibkr_service = IBKRService(
        host=os.getenv("IBKR_HOST", "127.0.0.1"),
        port=int(os.getenv("IBKR_PORT", "7497")),
        client_id=int(os.getenv("IBKR_CLIENT_ID", "1"))
    )
    # Run DB migration to ensure new ScreenerUniverse columns exist
    from database.db import SessionLocal
    from sqlalchemy import text
    db_session = SessionLocal()
    try:
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS con_id INTEGER;"))
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS long_name VARCHAR(200);"))
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS exchange VARCHAR(50);"))
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS currency VARCHAR(10);"))
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS sector VARCHAR(100);"))
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS industry VARCHAR(100);"))
        db_session.execute(text("ALTER TABLE screener_universe ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);"))
        db_session.commit()
        logger.info("Successfully checked/added new ScreenerUniverse cache columns in DB.")
    except Exception as db_err:
        logger.error(f"Failed to auto-migrate database columns: {db_err}")
        db_session.rollback()
    finally:
        db_session.close()

    # Attempt to connect to IBKR on startup
    await ibkr_service.connect()
    
    logger.info("Application startup complete.")

@app.on_event("shutdown")
def shutdown_event():
    ibkr_service.disconnect()

@app.get("/api/status")
async def get_status():
    """
    Returns the current status of the Python service and connections.
    """
    return {
        "status": "running",
        "ibkr_connected": ibkr_service.ib.isConnected() if ibkr_service else False
    }

@app.get("/api/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    """
    Fetches raw portfolio positions & cash balances from IBKR and Kraken.
    """
    logger.info("Starting portfolio sync: fetching from IBKR and Kraken...")
    # Fetch IBKR positions and cash
    try:
        ibkr_positions = await ibkr_service.get_positions()
        ibkr_cash = await ibkr_service.get_cash_balances()
        logger.info(f"Successfully fetched {len(ibkr_positions) if ibkr_positions else 0} positions and cash balances from IBKR.")
        
        if ibkr_positions:
            unique_symbols = set()
            for pos in ibkr_positions:
                contract = pos.get("contract")
                if contract and contract.get("symbol"):
                    unique_symbols.add(contract["symbol"])
            
            async def fetch_symbol_metrics(sym):
                try:
                    curr_iv = None
                    for pos in ibkr_positions:
                        contract = pos.get("contract")
                        if contract and contract.get("symbol") == sym:
                            greeks = pos.get("greeks")
                            if greeks and greeks.get("iv") is not None:
                                curr_iv = greeks["iv"]
                                break
                    if curr_iv is None:
                        from database.models import Technical
                        latest_fund = db.query(Technical.iv).filter(
                            Technical.symbol == sym,
                            Technical.iv.isnot(None),
                            Technical.iv > 0
                        ).order_by(Technical.date.desc()).first()
                        if latest_fund:
                            curr_iv = latest_fund[0]
                    
                    iv_rank = None
                    if curr_iv is not None and curr_iv > 0:
                        import datetime
                        one_year_ago = datetime.date.today() - datetime.timedelta(days=365)
                        from database.models import Technical
                        records = db.query(Technical.iv).filter(
                            Technical.symbol == sym,
                            Technical.date >= one_year_ago,
                            Technical.iv.isnot(None),
                            Technical.iv > 0
                        ).all()
                        ivs = [r[0] for r in records]
                        if curr_iv not in ivs:
                            ivs.append(curr_iv)
                        min_iv = min(ivs)
                        max_iv = max(ivs)
                        if max_iv > min_iv:
                            iv_rank = round(((curr_iv - min_iv) / (max_iv - min_iv)) * 100, 1)
                        else:
                            iv_rank = 50.0
                    
                    import asyncio
                    earnings_date = await asyncio.to_thread(yahoo_service.get_earnings_date, sym)
                    return sym, {"iv_rank": iv_rank, "earnings_date": earnings_date}
                except Exception as ex:
                    logger.error(f"Error calculating metrics for {sym}: {ex}")
                    return sym, {"iv_rank": None, "earnings_date": None}
            
            import asyncio
            tasks = [fetch_symbol_metrics(sym) for sym in unique_symbols]
            results = await asyncio.gather(*tasks)
            symbol_metrics = dict(results)
            
            for pos in ibkr_positions:
                contract = pos.get("contract")
                if contract and contract.get("symbol"):
                    sym = contract["symbol"]
                    metrics = symbol_metrics.get(sym, {})
                    pos["iv_rank"] = metrics.get("iv_rank")
                    pos["earnings_date"] = metrics.get("earnings_date")
    except Exception as e:
        logger.error(f"Error fetching IBKR portfolio: {e}")
        ibkr_positions = None
        ibkr_cash = None
    
    # Fetch Kraken balances disabled
    kraken_holdings = {}
    
    return {
        "status": "success",
        "ibkr": {
            "positions": ibkr_positions,
            "cash": ibkr_cash,
            "connected": ibkr_service.ib.isConnected()
        },
        "kraken": {
            "balances": kraken_holdings
        }
    }

class EnrichAsset(BaseModel):
    symbol: str
    currency: str
    exchange: str = "SMART"
    secType: str = "STK"

class EnrichRequest(BaseModel):
    symbols: List[EnrichAsset]

@app.post("/api/enrich-symbols")
async def enrich_symbols(req: EnrichRequest):
    import asyncio
    logger.info(f"Received enrich-symbols request for {len(req.symbols)} symbols")
    
    ETF_MAPPING = {
        "SEMI": {"sector": "Technology", "industry": "Semiconductors"},
        "SEMI.AS": {"sector": "Technology", "industry": "Semiconductors"},
        "SXR8": {"sector": "ETF", "industry": "Broad Market"},
        "SXR8.DE": {"sector": "ETF", "industry": "Broad Market"},
        "QQQ": {"sector": "Technology", "industry": "Broad Market"},
        "SPY": {"sector": "ETF", "industry": "Broad Market"},
    }

    async def fetch_enrich(asset: EnrichAsset):
        sym = asset.symbol
        if sym in ETF_MAPPING:
            return sym, ETF_MAPPING[sym]
        
        try:
            # IBKR requires the "Reuters Fundamentals" subscription to return sector/industry.
            # Without it, it throws Error 10358 and returns empty category/industry.
            # So we use Yahoo Finance instead (like Watchlist does).
            
            # Try plain symbol first
            info = await asyncio.to_thread(yahoo_service.get_fundamentals, sym)
            
            # If failed, try common European suffixes (IBKR European stocks often need this for Yahoo)
            if not info and asset.currency == 'EUR':
                for suffix in ['.DE', '.AS', '.PA', '.MI']:
                    info = await asyncio.to_thread(yahoo_service.get_fundamentals, f"{sym}{suffix}")
                    if info:
                        break
            
            if not info:
                return sym, {"sector": "Unknown", "industry": "Unknown"}
            
            sector = info.get("sector")
            industry = info.get("industry")
            
            quote_type = info.get("quoteType", "")
            if not sector and quote_type == "ETF":
                sector = "ETF"
                industry = "Broad Market"
                
            return sym, {
                "sector": sector or "Unknown",
                "industry": industry or "Unknown"
            }
        except Exception as e:
            logger.error(f"Error enriching {sym}: {e}")
            return sym, {"sector": "Unknown", "industry": "Unknown"}

    tasks = [fetch_enrich(a) for a in req.symbols]
    results = await asyncio.gather(*tasks)
    return {"status": "success", "data": dict(results)}

@app.get("/api/contract-details")
async def get_contract_details(symbol: str, sec_type: str = "STK", currency: str = "USD"):
    details = await ibkr_service.get_contract_details(symbol, sec_type, currency)
    if not details:
        try:
            info = yahoo_service.get_fundamentals(symbol)
            if info:
                return {
                    "symbol": symbol,
                    "longName": info.get("name") or symbol,
                    "industry": info.get("industry") or "",
                    "secType": sec_type,
                    "currency": currency,
                    "exchange": "SMART"
                }
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Contract details not found")
    return details

@app.get("/api/price")
async def get_price(symbol: str, currency: str = "USD", exchange: str = "SMART", sec_type: str = "STK", con_id: int = 0):
    """
    Returns last price for a symbol using Kraken (if CRYPTO), IBKR, falling back to Yahoo Finance.
    """
    price_data = {}
    
    # Auto-detect Forex/Commodity format from manual user inputs (e.g., XAG/USD or XAGUSD)
    if sec_type == "STK":
        if "/" in symbol:
            parts = symbol.split("/")
            if len(parts) == 2:
                symbol = parts[0]
                currency = parts[1]
                sec_type = "CMDTY" if symbol in ["XAG", "XAU", "XPT", "XPD"] else "CASH"
        elif len(symbol) == 6 and symbol[3:] in ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD", "TRY"]:
            currency = symbol[3:]
            symbol = symbol[:3]
            sec_type = "CMDTY" if symbol in ["XAG", "XAU", "XPT", "XPD"] else "CASH"
    
    # 1. Try Kraken if CRYPTO
    if sec_type == "CRYPTO":
        try:
            kraken_prices = await kraken_service.get_crypto_prices([f"{symbol}{currency}"])
            if kraken_prices:
                return {
                    "symbol": symbol,
                    "price": list(kraken_prices.values())[0],
                    "source": "Kraken"
                }
        except Exception as e:
            logger.warning(f"Failed to get price from Kraken for {symbol}: {e}")
            
    # 2. Try IBKR
    try:
        snapshot = await ibkr_service.get_snapshot(symbol, sec_type=sec_type, currency=currency, exchange=exchange, con_id=con_id)
        if snapshot and snapshot.get("lastPrice") is not None:
            import math
            last_price = snapshot["lastPrice"]
            if not (isinstance(last_price, float) and math.isnan(last_price)):
                price_data = {
                    "symbol": symbol,
                    "price": last_price,
                    "source": "IBKR"
                }
    except Exception as e:
        logger.warning(f"Failed to get price from IBKR for {symbol}: {e}")
        
    # 3. Fallback to Yahoo (Usually only for STK, ETF, CASH or CMDTY)
    if not price_data and sec_type in ["STK", "ETF", "CASH", "CMDTY"]:
        try:
            # Format symbols for Yahoo Finance
            if sec_type == "CASH":
                yahoo_symbol = f"{symbol}{currency}=X"
            elif sec_type == "CMDTY":
                if symbol == "XAG": yahoo_symbol = "SI=F"
                elif symbol == "XAU": yahoo_symbol = "GC=F"
                else: yahoo_symbol = symbol
            else:
                yahoo_symbol = symbol
                
            info = yahoo_service.get_fundamentals(yahoo_symbol)
            
            # If not found and it's a EUR stock, try appending .DE (Xetra/German exchanges)
            if (not info or info.get("last_price") is None) and sec_type != "CASH" and currency == "EUR" and not symbol.endswith(".DE"):
                info_de = yahoo_service.get_fundamentals(f"{symbol}.DE")
                if info_de and info_de.get("last_price") is not None:
                    info = info_de
                    
            if info and info.get("last_price") is not None:
                import math
                last_price = info["last_price"]
                if not (isinstance(last_price, float) and math.isnan(last_price)):
                    price_data = {
                        "symbol": symbol,
                        "price": last_price,
                        "source": "Yahoo"
                    }
        except Exception as e:
            logger.error(f"Failed fallback price check for {symbol}: {e}")
            
    if not price_data:
        raise HTTPException(status_code=404, detail=f"Price not found for symbol: {symbol}")
        
    return price_data

@app.get("/api/currencies")
async def get_currencies(targets: str = "EUR,TRY,GBP,CHF"):
    """
    Returns exchange rates for given currencies against USD.
    E.g. {"EUR": 1.08, "TRY": 0.03} means 1 EUR = 1.08 USD.
    """
    logger.info(f"Fetching currency exchange rates for targets: {targets}")
    import yfinance as yf
    
    currencies = [c.strip() for c in targets.split(",")]
    rates = {}
    
    for c in currencies:
        if c == "USD":
            rates[c] = 1.0
            continue
        try:
            # Pair like EURUSD=X gives value of 1 EUR in USD
            ticker = yf.Ticker(f"{c}USD=X")
            hist = ticker.history(period="1d")
            if not hist.empty:
                rates[c] = float(hist["Close"].iloc[-1])
            else:
                logger.warning(f"No currency data found for {c}")
        except Exception as e:
            logger.error(f"Error fetching currency {c}: {e}")
            
    logger.info(f"Currency rates fetched successfully: {rates}")
    return rates

@app.get("/api/market-bar")
async def get_market_bar():
    import yfinance as yf
    symbols = ["SPY", "QQQ", "DIA", "EUR=X", "TRY=X"]
    data = {"indices": {}, "currencies": {}}
    
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="5d")
            if len(hist) >= 1:
                current_price = float(hist['Close'].iloc[-1])
                change_pct = 0.0
                if len(hist) >= 2:
                    prev_price = float(hist['Close'].iloc[-2])
                    if prev_price > 0:
                        change_pct = ((current_price - prev_price) / prev_price) * 100
                
                # Format to 2 decimal places
                current_price = round(current_price, 2)
                change_pct = round(change_pct, 2)
                    
                if sym == "SPY":
                    data["indices"]["SPY"] = {"price": current_price, "change_pct": change_pct}
                elif sym == "QQQ":
                    data["indices"]["QQQ"] = {"price": current_price, "change_pct": change_pct}
                elif sym == "DIA":
                    data["indices"]["DIA"] = {"price": current_price, "change_pct": change_pct}
                elif sym == "EUR=X":
                    data["currencies"]["USD/EUR"] = {"price": current_price, "change_pct": change_pct}
                elif sym == "TRY=X":
                    data["currencies"]["USD/TRY"] = {"price": current_price, "change_pct": change_pct}
        except Exception as e:
            logger.error(f"Error fetching market bar data for {sym}: {e}")
            
    return data

@app.get("/api/daily-sync")
async def daily_sync(symbol: str, db: Session = Depends(get_db), sync: SyncService = Depends(get_sync_service)):
    """
    Endpoint for the Node.js scheduler to trigger daily sync for a single ticker.
    """
    try:
        result = await sync.sync_daily_data(symbol, db)
        return result
    except Exception as e:
        logger.error(f"Error during daily sync for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ticker-data")
async def get_ticker_data(symbol: str, db: Session = Depends(get_db)):
    """Fetch historical candles and fundamentals for frontend chart"""
    from database.models import Candle, Fundamental
    
    candles = db.query(Candle).filter(Candle.symbol == symbol.upper()).order_by(Candle.date.asc()).all()
    if not candles:
        raise HTTPException(status_code=404, detail=f"No data found for symbol: {symbol}")
        
    fundamentals = db.query(Fundamental).filter(Fundamental.symbol == symbol.upper()).order_by(Fundamental.date.asc()).all()
    
    return {
        "symbol": symbol.upper(),
        "candles": [
            {
                "time": c.date.strftime("%Y-%m-%d"),
                "open": c.open,
                "high": c.high,
                "low": c.low,
                "close": c.close,
                "volume": c.volume,
                "sma_20": c.sma_20,
                "sma_50": c.sma_50,
                "sma_200": c.sma_200
            } for c in candles
        ],
        "fundamentals": [
            {
                "time": f.date.strftime("%Y-%m-%d"),
                "pe": f.pe,
                "peg": f.peg,
                "roic": f.roic,
                "roe": f.roe,
                "revenue_growth_yoy": f.revenue_growth_yoy
            } for f in fundamentals
        ]
    }


from datetime import datetime
from database.models import JobLog

@app.post("/api/logs")
async def create_log(request: LogRequest, db: Session = Depends(get_db)):
    """Save a job log to the database"""
    try:
        log_entry = JobLog(
            timestamp=datetime.utcnow(),
            level=request.level.upper(),
            source=request.source,
            message=request.message,
            details=request.details
        )
        db.add(log_entry)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to save log: {e}")
        raise HTTPException(status_code=500, detail="Failed to save log")

@app.get("/api/logs")
async def get_logs(source: Optional[str] = None, level: Optional[str] = None, limit: int = 100, db: Session = Depends(get_db)):
    """Retrieve historical logs"""
    query = db.query(JobLog)
    if source:
        query = query.filter(JobLog.source == source)
    if level:
        query = query.filter(JobLog.level == level.upper())
        
    logs = query.order_by(JobLog.timestamp.desc()).limit(limit).all()
    return logs

@app.post("/api/mine-ticker")
async def mine_ticker(request: MineTickerRequest, db: Session = Depends(get_db)):
    """Sync historical candles and fundamentals for a specific ticker"""
    logger.info(f"Starting data miner sync for ticker: {request.symbol}")
    sync_service = get_sync_service()
    try:
        result = await sync_service.sync_daily_data(request.symbol, db)
        # We drop fundamentals from the response to save network/memory overhead
        # because the NodeJS DataMiner job no longer processes them.
        result.pop("fundamentals", None)
        logger.info(f"Data miner sync completed successfully for {request.symbol}")
        return result
    except Exception as e:
        logger.error(f"Failed to mine ticker {request.symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, loop="asyncio")
