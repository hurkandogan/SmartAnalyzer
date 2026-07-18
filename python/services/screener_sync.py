import logging
import asyncio
from typing import List
from datetime import datetime

from sqlalchemy.orm import Session
from database.db import SessionLocal
from database.models import ScreenerUniverse, Fundamental, JobLog, Watchlist

from services.yahoo import YahooService
from services.ibkr import IBKRService

logger = logging.getLogger("smart_analyser.screener_sync")

class ScreenerSyncService:
    def __init__(self, ibkr_service: IBKRService = None):
        self.yahoo_service = YahooService()
        self.ibkr_service = ibkr_service

    def log_job(self, db: Session, level: str, message: str, details: str = None):
        log = JobLog(
            timestamp=datetime.utcnow(),
            level=level,
            source="screener-sync",
            message=message,
            details=details
        )
        db.add(log)
        db.commit()

    def calculate_score(self, fund_dict: dict) -> int:
        score = 0
        
        # 1. HARD FILTERS
        mc = fund_dict.get("market_cap")
        if mc is None or mc < 5_000_000_000:
            return 0
            
        pe = fund_dict.get("pe")
        if pe is None or pe <= 0 or pe > 30:
            return 0
            
        fcf = fund_dict.get("free_cashflow") or fund_dict.get("operating_cashflow")
        if fcf is None or fcf <= 0:
            return 0
            
        beta = fund_dict.get("beta")
        if beta is None or beta < 1.0 or beta > 1.8:
            return 0
            
        perf_1y = fund_dict.get("performance_1y")
        if perf_1y is None or perf_1y < -0.20:
            return 0

        # 2. WEIGHTED SCORING MATRIX (Max 100)
        
        # ROIC: >18% (25p), 12-18% (15p)
        roic = fund_dict.get("roic")
        if roic is not None:
            if roic > 0.18:
                score += 25
            elif 0.12 <= roic <= 0.18:
                score += 15

        # FCF Growth: >0 (20p), <=0 (12p)
        fcf_growth = fund_dict.get("fcf_growth_yoy")
        if fcf_growth is not None:
            if fcf_growth > 0:
                score += 20
            else:
                score += 12

        # PEG: <1.0 (20p), 1.0-1.5 (12p)
        peg = fund_dict.get("peg")
        if peg is not None:
            if peg < 1.0:
                score += 20
            elif 1.0 <= peg <= 1.5:
                score += 12

        # Net Debt / EBITDA: <1.5 (15p), 1.5-2.5 (9p)
        net_debt_ebitda = fund_dict.get("net_debt_to_ebitda")
        if net_debt_ebitda is not None:
            if net_debt_ebitda < 1.5:
                score += 15
            elif 1.5 <= net_debt_ebitda <= 2.5:
                score += 9

        # P/E: 10-22 (10p), 22-30 (6p)
        if pe is not None:
            if 10 <= pe <= 22:
                score += 10
            elif 22 < pe <= 30:
                score += 6

        # 1Y Fiyat Trendi (SMA 200): > SMA200 (10p), < SMA200 (2p)
        sma_200 = fund_dict.get("sma_200")
        last_price = fund_dict.get("last_price") or fund_dict.get("close_price")
        if sma_200 is not None and last_price is not None:
            if last_price > sma_200:
                score += 10
            else:
                score += 2

        return score

    async def sync_chunk(self, chunk_size: int = 50):
        db = SessionLocal()
        try:
            universe = db.query(ScreenerUniverse).filter(ScreenerUniverse.is_active == 1).all()
            if not universe:
                self.log_job(db, "INFO", "Screener universe is empty. Nothing to sync.")
                return
            
            import random
            symbols_to_sync = [u.symbol for u in universe]
            random.shuffle(symbols_to_sync)
            chunk = symbols_to_sync[:chunk_size]
            
            self.log_job(db, "INFO", f"Starting background sync for {len(chunk)} symbols in screener universe.")
            
            success_count = 0
            for symbol in chunk:
                try:
                    # 1. Try IBKR first
                    fund_data = None
                    if self.ibkr_service:
                        fund_data = await self.ibkr_service.get_fundamental_data(symbol)
                        
                    # 2. Fallback to Yahoo
                    if not fund_data:
                        fund_data = self.yahoo_service.get_fundamentals(symbol)
                        
                    if not fund_data:
                        logger.warning(f"Could not fetch fundamentals for {symbol}")
                        continue
                        
                    # 3. Calculate Score
                    score = self.calculate_score(fund_data)
                    fund_data["score"] = score
                    
                    # 4. Save to DB
                    today = datetime.utcnow().date()
                    db_fund = db.query(Fundamental).filter(
                        Fundamental.symbol == symbol,
                        Fundamental.date == today
                    ).first()
                    
                    if not db_fund:
                        db_fund = Fundamental(symbol=symbol, date=today)
                        db.add(db_fund)
                        
                    # Update fields
                    db_fund.pe = fund_data.get("pe")
                    db_fund.peg = fund_data.get("peg")
                    db_fund.roic = fund_data.get("roic")
                    db_fund.roe = fund_data.get("roe")
                    db_fund.market_cap = fund_data.get("market_cap")
                    db_fund.beta = fund_data.get("beta")
                    db_fund.free_cashflow = fund_data.get("free_cashflow")
                    db_fund.operating_cashflow = fund_data.get("operating_cashflow")
                    db_fund.fcf_growth_yoy = fund_data.get("fcf_growth_yoy")
                    db_fund.net_debt = fund_data.get("net_debt")
                    db_fund.ebitda = fund_data.get("ebitda")
                    db_fund.net_debt_to_ebitda = fund_data.get("net_debt_to_ebitda")
                    db_fund.sma_200 = fund_data.get("sma_200")
                    db_fund.sector = fund_data.get("sector")
                    db_fund.industry = fund_data.get("industry")
                    db_fund.score = score
                    db_fund.performance_1y = fund_data.get("performance_1y")
                    
                    db.commit()
                    success_count += 1
                    
                    # Small sleep to prevent API blocking
                    await asyncio.sleep(0.5)
                    
                except Exception as e:
                    logger.error(f"Error processing {symbol}: {e}")
                    db.rollback()
                    
            self.log_job(db, "SUCCESS", f"Screener sync complete. Updated {success_count}/{len(chunk)} symbols.")
            
            # Push results to Firebase
            await self.push_to_firebase(db)
            
        except Exception as e:
            self.log_job(db, "ERROR", f"Screener sync failed: {e}")
            logger.error(f"Screener sync failed: {e}")
        finally:
            db.close()

    async def push_to_firebase(self, db: Session):
        try:
            import httpx
            import yfinance as yf
            
            # 1. Generate Heatmap (Sector/Industry 1Y and 1D Performance)
            SECTOR_ETFS = {
                "Technology": "XLK",
                "Software": "IGV",
                "Semiconductors": "SMH",
                "Aerospace": "ITA",
                "Financials": "XLF",
                "Healthcare": "XLV",
                "Energy": "XLE",
                "Consumer Discretionary": "XLY",
                "Industrials": "XLI",
                "Utilities": "XLU",
                "Real Estate": "XLRE",
                "Materials": "XLB",
                "Communication": "XLC",
                "Consumer Staples": "XLP"
            }
            
            sector_perf = []
            tickers = list(SECTOR_ETFS.values())
            try:
                data_1y = await asyncio.to_thread(yf.download, tickers, period="1y", group_by="ticker", threads=True, progress=False)
                data_5d = await asyncio.to_thread(yf.download, tickers, period="5d", group_by="ticker", threads=True, progress=False)
                
                for name, ticker in SECTOR_ETFS.items():
                    try:
                        df_1y = data_1y[ticker] if len(tickers) > 1 else data_1y
                        df_5d = data_5d[ticker] if len(tickers) > 1 else data_5d
                        
                        df_1y = df_1y.dropna(subset=['Close'])
                        df_5d = df_5d.dropna(subset=['Close'])
                        
                        if len(df_1y) >= 2 and len(df_5d) >= 2:
                            last_price = float(df_5d['Close'].iloc[-1])
                            price_1y_ago = float(df_1y['Close'].iloc[0])
                            price_1d_ago = float(df_5d['Close'].iloc[-2])
                            
                            perf_1y = ((last_price - price_1y_ago) / price_1y_ago)
                            perf_1d = ((last_price - price_1d_ago) / price_1d_ago)
                            
                            # Calculate 1-Week (5 trading days ago) and 1-Month (21 trading days ago)
                            price_1w_ago = float(df_1y['Close'].iloc[-6]) if len(df_1y) >= 6 else float(df_1y['Close'].iloc[0])
                            price_1m_ago = float(df_1y['Close'].iloc[-22]) if len(df_1y) >= 22 else float(df_1y['Close'].iloc[0])
                            
                            perf_1w = ((last_price - price_1w_ago) / price_1w_ago)
                            perf_1m = ((last_price - price_1m_ago) / price_1m_ago)
                            
                            sector_perf.append({
                                "name": name,
                                "ticker": ticker,
                                "performance_1y": perf_1y,
                                "performance_1d": perf_1d,
                                "performance_1w": perf_1w,
                                "performance_1m": perf_1m
                            })
                    except Exception as e:
                        logger.error(f"Error calculating performance for {name} ({ticker}): {e}")
            except Exception as e:
                logger.error(f"Failed to fetch Sector ETF data: {e}")

            # 2. Extract Opportunities (Score >= 75)
            funds = db.query(Fundamental).filter(Fundamental.score >= 75).all()
            latest_funds = {}
            for f in funds:
                if f.symbol not in latest_funds or f.date > latest_funds[f.symbol].date:
                    latest_funds[f.symbol] = f
            
            # Map symbols to long names from ScreenerUniverse
            symbols = list(latest_funds.keys())
            long_names = {}
            if symbols:
                universe_items = db.query(ScreenerUniverse).filter(ScreenerUniverse.symbol.in_(symbols)).all()
                for item in universe_items:
                    if item.long_name:
                        long_names[item.symbol] = item.long_name

            ops = []
            for f in latest_funds.values():
                ops.append({
                    "symbol": f.symbol,
                    "long_name": long_names.get(f.symbol) or f.symbol,
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
            
            ops.sort(key=lambda x: x["score"], reverse=True)
            
            # 3. Fetch current prices for Watchlist + Opportunities
            watchlist_syms = [w.symbol for w in db.query(Watchlist).all()]
            opp_syms = [o["symbol"] for o in ops]
            price_syms = list(set(watchlist_syms + opp_syms))
            
            prices_dict = {}
            if price_syms:
                try:
                    logger.info(f"Fetching bulk prices for {len(price_syms)} symbols via yfinance...")
                    yf_data = await asyncio.to_thread(
                        yf.download, 
                        price_syms, 
                        period="1d", 
                        group_by="ticker", 
                        progress=False, 
                        threads=True
                    )
                    
                    for sym in price_syms:
                        try:
                            df = yf_data[sym] if len(price_syms) > 1 else yf_data
                            df = df.dropna(subset=['Close'])
                            if not df.empty:
                                prices_dict[sym.upper()] = float(df['Close'].iloc[-1])
                        except Exception as e:
                            logger.error(f"Error parsing bulk yfinance price for {sym}: {e}")
                except Exception as e:
                    logger.error(f"Failed to fetch bulk yfinance prices: {e}")
                
                # Fallback to IBKR snapshot prices for missing symbols
                missing_syms = [sym for sym in price_syms if sym.upper() not in prices_dict]
                if missing_syms and self.ibkr_service:
                    logger.info(f"Fetching fallback IBKR snapshot prices for {len(missing_syms)} missing symbols...")
                    for chunk in [missing_syms[i:i+20] for i in range(0, len(missing_syms), 20)]:
                        tasks = [self.ibkr_service.get_snapshot(sym) for sym in chunk]
                        snapshots = await asyncio.gather(*tasks)
                        for snap in snapshots:
                            if snap and snap.get("lastPrice") is not None:
                                prices_dict[snap["symbol"].upper()] = snap["lastPrice"]

            # 4. Push via Hono Proxy
            hono_url = "http://localhost:3500/api/screener/push-firebase"
            async with httpx.AsyncClient() as client:
                await client.post(hono_url, json={"type": "heatmap", "data": sector_perf})
                await client.post(hono_url, json={"type": "opportunities", "data": ops})
                if prices_dict:
                    await client.post(hono_url, json={"type": "prices", "data": prices_dict})
                
            self.log_job(db, "INFO", f"Successfully pushed latest Sector ETF Heatmap, Opportunities, and {len(prices_dict)} prices to Firebase via Hono.")
        except Exception as e:
            self.log_job(db, "ERROR", f"Failed to push to Firebase: {e}")
            logger.error(f"Failed to push to Firebase: {e}")

    async def start_background_loop(self):
        logger.info("Starting Screener Background Sync Loop (24/7).")
        while True:
            try:
                # Sync 50 stocks each iteration
                await self.sync_chunk(chunk_size=50)
            except Exception as e:
                logger.error(f"Error in background sync loop: {e}")
            
            # Sleep for 1 hour to avoid API rate limits
            await asyncio.sleep(3600)
