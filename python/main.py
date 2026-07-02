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
    # Attempt to connect to IBKR on startup
    await ibkr_service.connect()

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
async def get_portfolio():
    """
    Fetches raw portfolio positions & cash balances from IBKR and Kraken.
    """
    logger.info("Starting portfolio sync: fetching from IBKR and Kraken...")
    # Fetch IBKR positions and cash
    try:
        ibkr_positions = await ibkr_service.get_positions()
        ibkr_cash = await ibkr_service.get_cash_balances()
        logger.info(f"Successfully fetched {len(ibkr_positions) if ibkr_positions else 0} positions and cash balances from IBKR.")
    except Exception as e:
        logger.error(f"Error fetching IBKR portfolio: {e}")
        ibkr_positions = []
        ibkr_cash = {}
    
    # Fetch Kraken balances
    try:
        kraken_holdings = await kraken_service.get_balances()
        logger.info(f"Successfully fetched {len(kraken_holdings) if kraken_holdings else 0} asset balances from Kraken.")
    except Exception as e:
        logger.error(f"Error fetching Kraken balances: {e}")
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

class ScanAlertRequest(BaseModel):
    watchlist: List[str]
    portfolios: Dict[str, Dict[str, Any]]
    force_risk: Optional[bool] = False


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
    scored_symbols = []
    for symbol in request.watchlist:
        symbol = symbol.upper()
        logger.info(f"[Scanner] Scanning {symbol}...")
        
        try:
            candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(250).all()
            if not candles:
                # Fallback to yahoo
                candles_data = yahoo_service.get_historical_candles(symbol)
            else:
                candles.reverse()
                candles_data = [
                    {
                        "date": c.date.strftime("%Y-%m-%d"),
                        "open": c.open,
                        "high": c.high,
                        "low": c.low,
                        "close": c.close,
                        "volume": c.volume
                    } for c in candles
                ]
                
            if not candles_data or len(candles_data) < 20:
                logger.warning(f"[Scanner] Not enough candle data for {symbol}. Skipping.")
                continue
                
            closes = [c["close"] for c in candles_data]
            rsi = analytics_service.compute_rsi(closes)
            crosses = analytics_service.detect_crosses(closes)
            
            # Fetch latest fundamental record
            fund = db.query(Fundamental).filter(Fundamental.symbol == symbol).order_by(Fundamental.date.desc()).first()
            rvol = fund.rvol if fund else 1.0
            iv = fund.iv if (fund and fund.iv) else 0.0
            
            # Scoring logic (Golden Cross, Extreme RSI, RVOL, etc.)
            score = 0
            if crosses["golden_cross"]: score += 12
            elif crosses["gc_coming"]: score += 8
            if crosses["death_cross"]: score += 6
            elif crosses["dc_coming"]: score += 4
            
            if rsi is not None:
                if rsi <= 32: score += 10
                elif rsi >= 68: score += 8
                
            if rvol is not None and rvol >= 1.8:
                score += 6
                
            scored_symbols.append({
                "symbol": symbol,
                "score": score,
                "candles": candles_data,
                "rsi": rsi,
                "rvol": rvol,
                "iv": iv,
                "crosses": crosses,
                "last_price": closes[-1]
            })
            logger.info(f"[Scanner] Scored {symbol}: {score}")
        except Exception as e:
            logger.error(f"[Scanner] Error scanning {symbol}: {e}")
            
    # Sort and pick top 2 that have a signal (score > 0)
    scored_symbols.sort(key=lambda x: x["score"], reverse=True)
    top_symbols = [s for s in scored_symbols if s["score"] > 0][:2]
    
    # ── Step 2: Generate PDF Reports and Send to Public Telegram ──
    generated_pdfs = []
    tele_pub = TelegramService()
    
    for item in top_symbols:
        symbol = item["symbol"]
        logger.info(f"[Scanner] Generating PDF Report for {symbol} (Score: {item['score']})...")
        try:
            # Fetch yfinance news and earnings date
            news = yahoo_service.get_ticker_news(symbol)
            earnings_date = yahoo_service.get_earnings_date(symbol)
            closes = [c["close"] for c in item["candles"]]
            df_candles = pd.DataFrame(item["candles"])
            
            # Technical stats
            tech_data = {
                "last_price": item["last_price"],
                "rsi": item["rsi"],
                "rvol": item["rvol"],
                "atr": compute_atr(df_candles, 14),
                "sma20": analytics_service.compute_sma(closes, 20),
                "sma50": analytics_service.compute_sma(closes, 50),
                "sma200": analytics_service.compute_sma(closes, 200),
                "gc_coming": item["crosses"]["gc_coming"],
                "dc_coming": item["crosses"]["dc_coming"],
                "iv": item["iv"]
            }
            
            # Generate AI Wall Street commentary
            ai_comment = await generate_stock_analysis(symbol, tech_data, news)
            
            # Generate report
            pdf_path = generate_pdf_report(symbol, item["candles"], iv_history=[], ai_comment=ai_comment, earnings_date=earnings_date)
            generated_pdfs.append(pdf_path)
            
            # Send Document to Telegram
            caption = f"📊 **{symbol} Günlük Analiz Raporu**\n\nSinyal gücü yüksek hissemizin detaylı analizi ektedir."
            await tele_pub.send_document(pdf_path, caption=caption)
            logger.info(f"[Scanner] Report sent for {symbol}")
        except Exception as e:
            logger.error(f"[Scanner] Failed to generate/send report for {symbol}: {e}")
            
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
        "processed_watchlist_count": len(scored_symbols),
        "top_symbols_selected": [x["symbol"] for x in top_symbols],
        "generated_reports_count": len(generated_pdfs)
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
