import asyncio
import logging
from typing import List, Dict, Any, Optional
from ib_insync import IB, Contract, Stock, Option, AccountValue, BarDataList
import yfinance as yf

logger = logging.getLogger("smart_analyser.ibkr")

BETA_CACHE = {}

class IBKRService:
    def __init__(self, host: str = "127.0.0.1", port: int = 7497, client_id: int = 1):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.ib = None
        self.lock = None

    async def connect(self) -> bool:
        if self.lock is None:
            self.lock = asyncio.Lock()
        if self.ib is None:
            import ib_insync.util
            ib_insync.util.getLoop = asyncio.get_running_loop
            self.ib = IB()
            
        async with self.lock:
            if self.ib.isConnected():
                return True
            try:
                logger.info(f"Connecting to IBKR TWS/Gateway at {self.host}:{self.port} (clientId={self.client_id})...")
                await self.ib.connectAsync(self.host, self.port, clientId=self.client_id)
                # Set delayed market data type (3 = delayed, 1 = realtime, 4 = delayed-frozen)
                self.ib.reqMarketDataType(3)
                logger.info("Connected to IBKR successfully (delayed market data active).")
                return True
            except Exception as e:
                logger.error(f"Failed to connect to IBKR: {e}")
                return False

    def disconnect(self):
        if self.ib and self.ib.isConnected():
            self.ib.disconnect()
            logger.info("Disconnected from IBKR.")

    async def ensure_connected(self) -> bool:
        if not self.ib or not self.ib.isConnected():
            return await self.connect()
        return True

    async def get_positions(self) -> Optional[List[Dict[str, Any]]]:
        if not await self.ensure_connected():
            return None
        
        try:
            positions = []
            # ib.portfolio() returns PortfolioItem which includes marketPrice
            raw_portfolio = self.ib.portfolio()
            
            def clean_nan(v):
                import math
                if v is None: return None
                if isinstance(v, float) and math.isnan(v): return None
                return v

            # Pre-fetch Greeks for options
            opt_contracts = []
            for item in raw_portfolio:
                if item.contract.secType == "OPT":
                    # TWS requires an exchange for reqMktData, use SMART
                    c = item.contract
                    c.exchange = 'SMART'
                    opt_contracts.append(c)

            greeks_dict = {}
            if opt_contracts:
                self.ib.reqMarketDataType(3)  # Ensure delayed/realtime
                mkt_data_subs = []
                for c in opt_contracts:
                    mkt_data_subs.append(self.ib.reqMktData(c, "106", False, False)) # False for snapshot since generic tick 106 doesn't support snapshot
                await asyncio.sleep(1.5) # Give it time to fetch
                
                for i, c in enumerate(opt_contracts):
                    ticker = mkt_data_subs[i]
                    if ticker and ticker.modelGreeks:
                        greeks_dict[c.conId] = {
                            "delta": clean_nan(ticker.modelGreeks.delta),
                            "gamma": clean_nan(ticker.modelGreeks.gamma),
                            "theta": clean_nan(ticker.modelGreeks.theta),
                            "vega": clean_nan(ticker.modelGreeks.vega),
                            "iv": clean_nan(ticker.modelGreeks.impliedVol)
                        }
                    self.ib.cancelMktData(c)
                        
            for item in raw_portfolio:
                contract = item.contract
                # Map to a clean dict
                positions.append({
                    "account": item.account,
                    "contract": {
                        "conId": contract.conId,
                        "symbol": contract.symbol,
                        "secType": contract.secType,
                        "currency": contract.currency,
                        "exchange": contract.exchange,
                        "multiplier": contract.multiplier,
                        "strike": getattr(contract, "strike", 0.0),
                        "right": getattr(contract, "right", ""),
                        "lastTradeDateOrContractMonth": getattr(contract, "lastTradeDateOrContractMonth", "")
                    },
                    "position": clean_nan(item.position),
                    "avgCost": clean_nan(item.averageCost),
                    "marketPrice": clean_nan(item.marketPrice),
                    "marketValue": clean_nan(item.marketValue),
                    "unrealizedPNL": clean_nan(item.unrealizedPNL),
                    "realizedPNL": clean_nan(item.realizedPNL),
                    "greeks": greeks_dict.get(contract.conId, None)
                })

            # Pre-fetch and attach Beta from Yahoo using asyncio.to_thread
            unique_symbols = set([p["contract"]["symbol"] for p in positions])
            missing_betas = [s for s in unique_symbols if s not in BETA_CACHE]
            
            def fetch_betas_sync(symbols):
                for sym in symbols:
                    try:
                        ticker = yf.Ticker(sym)
                        BETA_CACHE[sym] = ticker.info.get("beta") or 1.0
                    except Exception:
                        BETA_CACHE[sym] = 1.0 # fallback
                        
            if missing_betas:
                await asyncio.to_thread(fetch_betas_sync, missing_betas)

            for p in positions:
                p["beta"] = BETA_CACHE.get(p["contract"]["symbol"], 1.0)
                
            return positions
        except Exception as e:
            logger.error(f"Error fetching positions: {e}")
            return None

    async def get_cash_balances(self) -> Dict[str, float]:
        if not await self.ensure_connected():
            return {}
        
        try:
            balances = {}
            # Get cash balance tag
            values = self.ib.accountValues()
            for val in values:
                try:
                    if val.tag in ["NetLiquidation", "BuyingPower", "ExcessLiquidity"]:
                        if val.currency == "BASE" or val.currency == "USD":
                            balances[val.tag] = float(val.value)
                    elif val.tag == "CashBalance":
                        if val.currency != "BASE":
                            balances[val.currency] = float(val.value)
                except ValueError:
                    pass
            return balances
        except Exception as e:
            logger.error(f"Error fetching account summary/cash: {e}")
            return {}

    async def get_contract_details(self, symbol: str, sec_type: str = "STK", currency: str = "USD") -> Optional[Dict[str, Any]]:
        if not await self.ensure_connected():
            return None
        
        try:
            if sec_type == "STK":
                contract = Stock(symbol, "SMART", currency)
            else:
                contract = Contract(symbol=symbol, secType=sec_type, currency=currency, exchange="SMART")
                
            details = await self.ib.reqContractDetailsAsync(contract)
            if not details:
                return None
            
            # Use the first contract details item
            cd = details[0]
            return {
                "conId": cd.contract.conId,
                "symbol": cd.contract.symbol,
                "longName": cd.longName,
                "industry": cd.industry,
                "category": cd.category,
                "subcategory": cd.subcategory,
                "secType": cd.contract.secType,
                "exchange": cd.contract.exchange,
                "currency": cd.contract.currency
            }
        except Exception as e:
            logger.error(f"Error fetching contract details for {symbol}: {e}")
            return None

    async def get_historical_candles(self, symbol: str, duration: str = "1 Y", bar_size: str = "1 day", what_to_show: str = "TRADES") -> List[Dict[str, Any]]:
        if not await self.ensure_connected():
            return []
        
        try:
            contract = Stock(symbol, "SMART", "USD")
            qualified = await self.ib.qualifyContractsAsync(contract)
            if not qualified:
                logger.warning(f"Could not qualify contract for {symbol}")
                return []
            
            # Fetch historical data
            bars = await self.ib.reqHistoricalDataAsync(
                qualified[0],
                endDateTime="",
                durationStr=duration,
                barSizeSetting=bar_size,
                whatToShow=what_to_show,
                useRTH=True,
                formatDate=1
            )
            
            result = []
            for bar in bars:
                result.append({
                    "date": str(bar.date),
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume
                })
            return result
        except Exception as e:
            logger.error(f"Error fetching historical data for {symbol}: {e}")
            return []

    async def get_snapshot(self, symbol: str, sec_type: str = "STK", currency: str = "USD", exchange: str = "SMART", con_id: int = 0) -> Dict[str, Any]:
        if not await self.ensure_connected():
            return {}
        
        try:
            if con_id > 0:
                contract = Contract(conId=con_id, exchange=exchange)
            elif sec_type == "STK" and exchange == "SMART":
                if currency == "EUR":
                    contract = Contract(symbol=symbol, secType="STK", currency="EUR", exchange="SMART", primaryExchange="IBIS")
                else:
                    contract = Stock(symbol, exchange, currency)
            else:
                contract = Contract(symbol=symbol, secType=sec_type, currency=currency, exchange=exchange)
                
            qualified = await self.ib.qualifyContractsAsync(contract)
            if not qualified:
                return {}
            
            # Switch to delayed frozen data (4) to get price even if market closed or no subscription
            self.ib.reqMarketDataType(4)
            ticker = self.ib.reqMktData(qualified[0], "", True, False)
            # Wait up to 5 seconds for ticker data to populate
            for _ in range(50):
                if getattr(ticker, "close", None) is not None or getattr(ticker, "last", None) is not None:
                    break
                await asyncio.sleep(0.1)
                
            # Stop market data subscription
            self.ib.cancelMktData(qualified[0])
            
            def clean_nan(v):
                import math
                if v is None: return None
                if isinstance(v, float) and math.isnan(v): return None
                return v

            last_val = getattr(ticker, "last", None)
            close_val = getattr(ticker, "close", None)
            
            return {
                "symbol": symbol,
                "lastPrice": clean_nan(last_val) if clean_nan(last_val) is not None else clean_nan(close_val),
                "closePrice": clean_nan(close_val),
                "high": clean_nan(getattr(ticker, "high", None)),
                "low": clean_nan(getattr(ticker, "low", None)),
                "volume": clean_nan(getattr(ticker, "volume", None)),
                "iv": clean_nan(getattr(ticker, "impliedVolatility", getattr(ticker, "impliedVol", None)))
            }
        except Exception as e:
            logger.error(f"Error fetching snapshot for {symbol}: {e}")
            return {}
            return {}
