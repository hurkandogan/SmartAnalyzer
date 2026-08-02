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

app = FastAPI(title="SmartAnalyser Python Bridge", version="3.0.0")

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
    
    # Start the continuous Screener sync loop
    from services.screener_sync import ScreenerSyncService
    screener_sync_service = ScreenerSyncService(ibkr_service=ibkr_service)
    asyncio.create_task(screener_sync_service.start_background_loop())

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
                        from database.models import Fundamental
                        latest_fund = db.query(Fundamental.iv).filter(
                            Fundamental.symbol == sym,
                            Fundamental.iv.isnot(None),
                            Fundamental.iv > 0
                        ).order_by(Fundamental.date.desc()).first()
                        if latest_fund:
                            curr_iv = latest_fund[0]
                    
                    iv_rank = None
                    if curr_iv is not None and curr_iv > 0:
                        import datetime
                        one_year_ago = datetime.date.today() - datetime.timedelta(days=365)
                        from database.models import Fundamental
                        records = db.query(Fundamental.iv).filter(
                            Fundamental.symbol == sym,
                            Fundamental.date >= one_year_ago,
                            Fundamental.iv.isnot(None),
                            Fundamental.iv > 0
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

@app.post("/api/analyze")
async def analyze_watchlist(request: AnalyzeRequest):
    """
    Performs stock analysis:
    - Checks 1 random/specific ticker for corporate action adjustments (split/dividend).
    - If adjustment is found, triggers full history fetch for that ticker.
    - Computes RSI, SMA20/50/200, and cross detection.
    """
    logger.info(f"Starting stock analysis for {len(request.symbols)} symbols: {request.symbols}")
    results = {}
    split_checked = False
    
    for symbol in request.symbols:
        logger.info(f"[Analysis] Processing {symbol}...")
        # Fetch historical daily data (1 year)
        # Try IBKR first, fallback to Yahoo
        candles = await ibkr_service.get_historical_candles(symbol)
        source = "IBKR"
        if not candles:
            candles = yahoo_service.get_historical_candles(symbol)
            source = "Yahoo"
            
        if not candles:
            results[symbol] = {"error": "Failed to fetch price history"}
            continue
            
        closes = [c["close"] for c in candles]
        
        # Check split/dividend on the first candidate we have cached data for
        needs_history_update = False
        if not split_checked and symbol in request.cached_candles:
            cached_info = request.cached_candles[symbol]
            cached_dict = {"date": cached_info.date, "close": cached_info.close}
            has_split = analytics_service.check_splits_and_dividends(cached_dict, candles)
            if has_split:
                needs_history_update = True
                # We stop checking splits/dividends for other tickers today to respect rate limits
                split_checked = True
                logger.info(f"Triggering full historical refresh for {symbol} due to split/dividend detection.")
        
        # Compute indicators
        rsi = analytics_service.compute_rsi(closes)
        sma20 = analytics_service.compute_sma(closes, 20)
        sma50 = analytics_service.compute_sma(closes, 50)
        sma200 = analytics_service.compute_sma(closes, 200)
        crosses = analytics_service.detect_crosses(closes)
        
        results[symbol] = {
            "symbol": symbol,
            "source": source,
            "last_price": closes[-1] if closes else None,
            "rsi": rsi,
            "sma20": sma20,
            "sma50": sma50,
            "sma200": sma200,
            "golden_cross": crosses["golden_cross"],
            "death_cross": crosses["death_cross"],
            "needs_history_update": needs_history_update,
            # Return candles only if history update is required
            "candles": candles if needs_history_update else None
        }
        logger.info(f"[Analysis] Finished processing {symbol}. Source: {source}, Needs Update: {needs_history_update}")
        
    logger.info("Stock analysis completed for all requested symbols.")
    return results

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
                "forward_pe": f.forward_pe,
                "peg": f.peg,
                "ev_to_revenue": f.ev_to_revenue,
                "roic": f.roic,
                "roe": f.roe,
                "rsi": f.rsi,
                "avg_volume": f.avg_volume,
                "rvol": f.rvol,
                "iv": f.iv,
                "cash_burn_rate": f.cash_burn_rate,
                "cash_runway": f.cash_runway,
                "revenue_growth_yoy": f.revenue_growth_yoy,
                "short_interest_pct": f.short_interest_pct
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

@app.get("/api/analyze-ticker")
async def analyze_ticker(symbol: str, db: Session = Depends(get_db)):
    """
    Reads the latest data from DB (NO external scraping), computes advanced analytics,
    predicts crosses, generates AI comments, and returns a StockAnalysis dict.
    """
    logger.info(f"Analyzing {symbol} using local database...")
    from database.models import Candle, Fundamental
    
    symbol = symbol.upper()
    
    # 1. Get recent candles
    candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(250).all()
    if not candles:
        logger.error(f"No candles found for {symbol} in DB.")
        raise HTTPException(status_code=404, detail=f"No candles found for {symbol}. Run data miner first.")
        
    candles.reverse() # chronological
    closes = [c.close for c in candles]
    latest_candle = candles[-1]
    
    # 2. Get latest fundamentals
    fund_record = db.query(Fundamental).filter(Fundamental.symbol == symbol).order_by(Fundamental.date.desc()).first()
    if not fund_record:
        logger.error(f"No fundamentals found for {symbol} in DB.")
        raise HTTPException(status_code=404, detail=f"No fundamentals found for {symbol}.")
        
    logger.info(f"Found {len(candles)} candles and fundamentals for {symbol}. Computing crosses and generating AI insights...")
    # 3. Compute analytics
    crosses = analytics_service.detect_crosses(closes)
    
    # Pack fundamentals dictionary
    fund_dict = {
        "pe": fund_record.pe,
        "forward_pe": fund_record.forward_pe,
        "peg": fund_record.peg,
        "ev_to_revenue": fund_record.ev_to_revenue,
        "roic": fund_record.roic,
        "roe": fund_record.roe,
        "rsi": fund_record.rsi,
        "avg_volume": fund_record.avg_volume,
        "rvol": fund_record.rvol,
        "cash_burn_rate": fund_record.cash_burn_rate,
        "cash_runway": fund_record.cash_runway,
        "revenue_growth": fund_record.revenue_growth_yoy,
        "short_ratio": fund_record.short_interest_pct,
        "iv": fund_record.iv,
        "de_ratio": None # We need to ensure de_ratio is fetched somewhere, but it's not in DB schema yet. It might be missing.
    }
    
    # Determine cross_signal for UI
    cross_signal = None
    if crosses["golden_cross"]: cross_signal = "GC"
    elif crosses["death_cross"]: cross_signal = "DC"
    elif crosses["gc_coming"]: cross_signal = "GC_COMING"
    elif crosses["dc_coming"]: cross_signal = "DC_COMING"
    
    # 4. Generate Insights
    insights_html = analytics_service.generate_insights(fund_dict, crosses)
    
    # 5. Build response that looks like what NodeJS expects for `StockAnalysis`
    response_data = {
        "status": "success",
        "symbol": symbol,
        "date": latest_candle.date.strftime("%Y-%m-%d"),
        "fundamentals": {
            "date": latest_candle.date.strftime("%Y-%m-%d"),
            "symbol": symbol,
            "last_price": latest_candle.close,
            "volume": latest_candle.volume,
            "pe": fund_record.pe,
            "forward_pe": fund_record.forward_pe,
            "peg": fund_record.peg,
            "ev_to_revenue": fund_record.ev_to_revenue,
            "roic": fund_record.roic,
            "roe": fund_record.roe,
            "rsi": fund_record.rsi,
            "avg_volume": fund_record.avg_volume,
            "rvol": fund_record.rvol,
            "cash_burn_rate": fund_record.cash_burn_rate,
            "cash_runway": fund_record.cash_runway,
            "revenue_growth": fund_record.revenue_growth_yoy,
            "short_interest_pct": fund_record.short_interest_pct,
            "iv": fund_record.iv * 100 if fund_record.iv is not None else None,
            "market_cap": fund_record.market_cap,
            "beta": fund_record.beta,
            "eps": fund_record.eps,
            "forward_eps": fund_record.forward_eps,
            "dividend_yield": fund_record.dividend_yield,
            "profit_margin": fund_record.profit_margin,
            "operating_margin": fund_record.operating_margin,
            "gross_margin": fund_record.gross_margin,
            "ev_to_ebitda": fund_record.ev_to_ebitda,
            "current_ratio": fund_record.current_ratio,
            "de_ratio": fund_record.de_ratio,
            "payout_ratio": fund_record.payout_ratio,
            "ebitda": fund_record.ebitda,
            "free_cashflow": fund_record.free_cashflow,
            "operating_cashflow": fund_record.operating_cashflow,
            "fcf_growth_yoy": fund_record.fcf_growth_yoy,
            "net_debt": fund_record.net_debt,
            "net_debt_to_ebitda": fund_record.net_debt_to_ebitda,
            "sma_200": fund_record.sma_200,
            "sector": fund_record.sector,
            "industry": fund_record.industry,
            "performance_1y": fund_record.performance_1y,
            "cross_signal": cross_signal
        },
        "comments": insights_html if insights_html else None
    }
    
    return response_data

from services.telegram import TelegramService
from services.pdf_generator import generate_pdf_report, compute_atr
from services.agent_analyst import generate_stock_analysis, generate_portfolio_risk_report, generate_market_weather
from services.macro import MacroService
import pandas as pd

from screener_routes import router as screener_router
app.include_router(screener_router)

class ScanAlertRequest(BaseModel):
    watchlist: List[str]
    portfolios: Dict[str, Dict[str, Any]]
    force_risk: Optional[bool] = False
    force_scan: Optional[bool] = False

class ScanIvCrushRequest(BaseModel):
    watchlist: List[str]
    send_telegram: Optional[bool] = False

@app.post("/api/scan-iv-crush")
async def scan_iv_crush(request: ScanIvCrushRequest, db: Session = Depends(get_db)):
    from services.iv_crush_scanner import IVCrushScannerService
    logger.info(f"Starting IV Crush scan for {len(request.watchlist)} symbols.")
    try:
        scanner = IVCrushScannerService()
        signals = await scanner.scan_signals(db, request.watchlist, request.send_telegram)
        return {"status": "success", "signals": signals}
    except Exception as e:
        logger.error(f"Error in IV Crush scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/api/scan-swing")
async def scan_swing(db: Session = Depends(get_db)):
    from services.swing_scanner import SwingScannerService
    from services.telegram import TelegramService
    logger.info("Starting Swing Scanner...")
    try:
        telegram = TelegramService()
        scanner = SwingScannerService(telegram)
        signals = await scanner.scan_signals(db, send_telegram=True)
        return {"status": "success", "signals": signals}
    except Exception as e:
        logger.error(f"Error in Swing Scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scan-and-alert")
async def scan_and_alert(request: ScanAlertRequest, db: Session = Depends(get_db)):
    """
    1. Scan watchlist and compute scores for technical signals.
    2. Pick top 2 most active/interesting symbols.
    3. Generate matplotlib charts, fetch Yahoo news, generate AI comments.
    4. Compile ReportLab PDF and post it to Telegram public channel.
    5. Perform risk analysis on all portfolios and send private reports.
    """
    logger.info("Starting Daily Event-Driven Scan & Alert Process...")
    from database.models import Candle, Fundamental
    
    # ── Step 1: Scan and score watchlist ──
    fundamental_symbols = []
    value_symbols = []
    
    for symbol in request.watchlist:
        symbol = symbol.upper()
        
        logger.info(f"[Scanner] Scanning {symbol}...")
        try:
            candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(250).all()
            if not candles:
                candles_data = yahoo_service.get_historical_candles(symbol)
            else:
                candles.reverse()
                candles_data = [{"date": c.date.strftime("%Y-%m-%d"), "open": c.open, "high": c.high, "low": c.low, "close": c.close, "volume": c.volume} for c in candles]
                
            if not candles_data or len(candles_data) < 20:
                continue
                
            closes = [c["close"] for c in candles_data]
            rsi = analytics_service.compute_rsi(closes)
            crosses = analytics_service.detect_crosses(closes)
            
            fund = db.query(Fundamental).filter(Fundamental.symbol == symbol).order_by(Fundamental.date.desc()).first()
            rvol = fund.rvol if fund else 1.0
            iv = fund.iv if (fund and fund.iv) else 0.0
            
            # --- Fundamental Scoring ---
            f_score = 0
            if crosses["golden_cross"]: f_score += 12
            elif crosses["gc_coming"]: f_score += 8
            if crosses["death_cross"]: f_score += 6
            elif crosses["dc_coming"]: f_score += 4
            
            if rsi is not None:
                if rsi <= 30: f_score += 12
                elif rsi <= 40: f_score += 8
                elif rsi <= 45: f_score += 4
                elif rsi >= 70: f_score += 8
                elif rsi >= 60: f_score += 4
                
            if rvol is not None:
                if rvol >= 1.8: f_score += 6
                elif rvol >= 1.3: f_score += 3
            if iv is not None:
                if iv >= 0.60: f_score += 10
                elif iv >= 0.40: f_score += 6
                elif iv >= 0.30: f_score += 3
                
            fundamental_symbols.append({
                "symbol": symbol, "score": f_score, "candles": candles_data, "rsi": rsi, "rvol": rvol, "iv": iv, "crosses": crosses, "last_price": closes[-1]
            })
            
            # --- Value Scoring ---
            v_score = 0
            if fund:
                # 1. Consistent Growth
                if fund.revenue_cagr_5y and fund.revenue_cagr_5y > 0.05: v_score += 10
                if fund.net_income_cagr_5y and fund.net_income_cagr_5y > 0.05: v_score += 10
                if fund.revenue_growth_fwd and fund.revenue_growth_fwd > 0.05: v_score += 5
                if fund.earnings_growth_fwd and fund.earnings_growth_fwd > 0.05: v_score += 5
                
                # 2. Profitability
                if fund.roic and fund.roic > 0.10: v_score += 10
                
                # 3. Market Mispricing (Price Drop or Underperformance)
                last_price = closes[-1]
                if fund.target_mean_price and last_price < fund.target_mean_price * 0.85: v_score += 15 # 15% below target
                if rsi is not None and rsi < 40: v_score += 10 # Oversold
                
                if v_score >= 30: # Only consider if there's actual value potential
                    value_symbols.append({
                        "symbol": symbol, "score": v_score, "candles": candles_data, "rsi": rsi, "rvol": rvol, "iv": iv, "crosses": crosses, "last_price": last_price
                    })
                    
        except Exception as e:
            logger.error(f"[Scanner] Error scanning {symbol}: {e}")
            
    # Sort
    fundamental_symbols.sort(key=lambda x: x["score"], reverse=True)
    value_symbols.sort(key=lambda x: x["score"], reverse=True)
    
    top_fundamental = fundamental_symbols[:2]
    top_value = value_symbols[:2]
    
    # ── Step 2: Generate Reports and Send to Telegram ──
    generated_pdfs = []
    tele_pub = TelegramService()
    
    from datetime import datetime, timedelta
    from database.models import GeneratedReportLog
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    async def process_report(item, scan_type, label):
        symbol = item["symbol"]
        
        if not request.force_scan:
            recent_report = db.query(GeneratedReportLog).filter(
                GeneratedReportLog.symbol == symbol,
                GeneratedReportLog.scan_type == scan_type,
                GeneratedReportLog.generated_at >= thirty_days_ago
            ).first()
            if recent_report:
                logger.info(f"[Scanner] Skipping {scan_type} report for {symbol} (already generated recently).")
                return
                
        logger.info(f"[Scanner] Generating {label} PDF Report for {symbol} (Score: {item['score']})...")
        try:
            news = yahoo_service.get_ticker_news(symbol)
            earnings_date = yahoo_service.get_earnings_date(symbol)
            closes = [c["close"] for c in item["candles"]]
            df_candles = pd.DataFrame(item["candles"])
            
            tech_data = {
                "last_price": item["last_price"], "rsi": item["rsi"], "rvol": item["rvol"],
                "atr": compute_atr(df_candles, 14),
                "sma20": analytics_service.compute_sma(closes, 20),
                "sma50": analytics_service.compute_sma(closes, 50),
                "sma200": analytics_service.compute_sma(closes, 200),
                "gc_coming": item["crosses"]["gc_coming"],
                "dc_coming": item["crosses"]["dc_coming"],
                "iv": item["iv"],
                "scan_type": scan_type
            }
            
            ai_comment = await generate_stock_analysis(symbol, tech_data, news)
            pdf_path = generate_pdf_report(symbol, item["candles"], iv_history=[], ai_comment=ai_comment, earnings_date=earnings_date)
            generated_pdfs.append(pdf_path)
            
            caption = f"📊 **{symbol} Günlük {label} Raporu**\n\nSinyal gücü yüksek hissemizin detaylı analizi ektedir."
            await tele_pub.send_document(pdf_path, caption=caption)
            
            report_log = GeneratedReportLog(symbol=symbol, generated_at=datetime.utcnow(), scan_type=scan_type)
            db.add(report_log)
            db.commit()
        except Exception as e:
            logger.error(f"[Scanner] Failed {scan_type} report for {symbol}: {e}")

    for item in top_fundamental:
        await process_report(item, "FUNDAMENTAL", "Teknik Analiz")
        
    for item in top_value:
        await process_report(item, "VALUE", "Değer/Büyüme")
            
    # ── Step 3: Run Portfolio Risk Analysis and Send Private Telegram ──
    # ONLY run this on Monday (weekday() == 0) unless force_risk is True
    from datetime import date as d_date
    is_monday = d_date.today().weekday() == 0
    if not is_monday and not request.force_risk:
        logger.info("[Scanner] Today is not Monday. Skipping weekly portfolio risk analysis report.")
    else:
        for user_id, port_data in request.portfolios.items():
            user_name = port_data.get("user_name", "Kullanıcı")
            assets = port_data.get("assets", [])
            
            if not assets:
                logger.info(f"[Scanner] No assets for {user_name}. Skipping risk report.")
                continue
                
            logger.info(f"[Scanner] Generating Risk Report for {user_name}...")
            try:
                risk_comment = await generate_portfolio_risk_report(user_name, assets)
                
                # Determine correct Telegram bot keys
                bot_token = port_data.get("telegram_bot_token") or os.getenv("TELEGRAM_PRIVATE_BOT_TOKEN")
                chat_id = port_data.get("telegram_chat_id") or os.getenv("TELEGRAM_PRIVATE_CHAT_ID")
                
                tele_priv = TelegramService(bot_token=bot_token, chat_id=chat_id)
                await tele_priv.send_message(risk_comment)
                logger.info(f"[Scanner] Risk report sent to {chat_id} for {user_name}")
            except Exception as e:
                logger.error(f"[Scanner] Failed portfolio risk analysis for {user_name}: {e}")
            
    return {
        "status": "success",
        "processed_watchlist_count": len(fundamental_symbols) + len(value_symbols),
        "top_symbols_selected": [x["symbol"] for x in top_fundamental] + [x["symbol"] for x in top_value],
        "generated_pdf_count": len(generated_pdfs)
    }

@app.get("/api/screener/value")
async def get_value_screener(db: Session = Depends(get_db)):
    """Fetch value investing opportunities"""
    from database.models import Fundamental, Candle
    from sqlalchemy import func
    
    # Get latest date for fundamentals
    latest_date_query = db.query(func.max(Fundamental.date)).scalar()
    
    if not latest_date_query:
        return []
        
    records = db.query(Fundamental).filter(Fundamental.date == latest_date_query).all()
    
    results = []
    for fund in records:
        # Calculate a value score
        score = 0
        if fund.revenue_cagr_5y and fund.revenue_cagr_5y > 0.05: score += 1
        if fund.net_income_cagr_5y and fund.net_income_cagr_5y > 0.05: score += 1
        if fund.revenue_growth_fwd and fund.revenue_growth_fwd > 0.05: score += 1
        if fund.earnings_growth_fwd and fund.earnings_growth_fwd > 0.05: score += 1
        if fund.roic and fund.roic > 0.10: score += 1
        
        # Get latest price
        latest_candle = db.query(Candle).filter(Candle.symbol == fund.symbol).order_by(Candle.date.desc()).first()
        last_price = latest_candle.close if latest_candle else None
        
        if fund.target_mean_price and last_price and last_price < fund.target_mean_price * 0.90:
            score += 2 # Strong price disconnect
            
        if score >= 3:
            results.append({
                "symbol": fund.symbol,
                "score": score,
                "revenue_cagr_5y": fund.revenue_cagr_5y,
                "net_income_cagr_5y": fund.net_income_cagr_5y,
                "revenue_growth_fwd": fund.revenue_growth_fwd,
                "earnings_growth_fwd": fund.earnings_growth_fwd,
                "roic": fund.roic,
                "pe": fund.pe,
                "forward_pe": fund.forward_pe,
                "target_mean_price": fund.target_mean_price,
                "last_price": last_price,
                "rsi": fund.rsi
            })
            
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

class OptionsSignalsRequest(BaseModel):
    watchlist: List[str]
    send_telegram: Optional[bool] = False

@app.post("/api/options-signals")
async def get_options_signals(request: OptionsSignalsRequest, db: Session = Depends(get_db)):
    """
    Scans watchlist symbols and returns high-probability option selling signals.
    """
    from services.options_signals import OptionsSignalsService
    service = OptionsSignalsService()
    signals = await service.scan_signals(db, request.watchlist, send_telegram=request.send_telegram)
    return {
        "status": "success",
        "signals": signals
    }

@app.post("/api/market-weather")
async def api_market_weather():
    """
    Fetches macro data and generates an AI 'Market Weather' report, sending it to the public Telegram channel.
    """
    logger.info("[Weather] Triggering Market Weather Report...")
    try:
        # 1. Fetch Macro Data
        macro_data = MacroService.get_market_weather_data()
        
        # 2. Generate AI Report
        weather_report = await generate_market_weather(macro_data)
        
        # 3. Send to Telegram
        tele_pub = TelegramService(
            bot_token=os.getenv("TELEGRAM_PUBLIC_BOT_TOKEN"),
            chat_id=os.getenv("TELEGRAM_PUBLIC_CHANNEL_ID")
        )
        await tele_pub.send_message(weather_report)
        logger.info("[Weather] Market Weather Report successfully sent.")
        
        return {"status": "success", "message": "Market Weather report sent."}
    except Exception as e:
        logger.error(f"[Weather] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, loop="asyncio")
