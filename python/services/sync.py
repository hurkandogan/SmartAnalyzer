import logging
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import math
import yfinance as yf
from sqlalchemy.orm import Session
from sqlalchemy import delete

from database.models import Candle, Fundamental, Watchlist
from services.ibkr import IBKRService
from services.yahoo import YahooService
from services.analytics import AnalyticsService

logger = logging.getLogger("smart_analyser.sync")

def erf(x):
    a1 =  0.254829592
    a2 = -0.284496736
    a3 =  1.421413741
    a4 = -1.453152027
    a5 =  1.061405429
    p  =  0.3275911
    sign = 1
    if x < 0:
        sign = -1
    x = abs(x)
    t = 1.0/(1.0 + p*x)
    y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*math.exp(-x*x)
    return sign*y

def normal_cdf(x):
    return 0.5 * (1.0 + erf(x / math.sqrt(2.0)))

def black_scholes_call(S, K, t, r, sigma):
    if sigma <= 0 or t <= 0:
        return max(0.0, S - K * math.exp(-r * t))
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    return S * normal_cdf(d1) - K * math.exp(-r * t) * normal_cdf(d2)

def black_scholes_put(S, K, t, r, sigma):
    if sigma <= 0 or t <= 0:
        return max(0.0, K * math.exp(-r * t) - S)
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    return K * math.exp(-r * t) * normal_cdf(-d2) - S * normal_cdf(-d1)

def find_implied_volatility(market_price, S, K, t, r, is_call=True):
    low = 0.0001
    high = 5.0
    for _ in range(100):
        mid = (low + high) / 2
        price = black_scholes_call(S, K, t, r, mid) if is_call else black_scholes_put(S, K, t, r, mid)
        if price < market_price:
            low = mid
        else:
            high = mid
        if abs(high - low) < 0.0001:
            break
    return mid

class SyncService:
    def __init__(self, ibkr: IBKRService, yahoo: YahooService, analytics: AnalyticsService):
        self.ibkr = ibkr
        self.yahoo = yahoo
        self.analytics = analytics

    def calculate_yfinance_iv(self, symbol: str) -> Optional[float]:
        try:
            ticker = yf.Ticker(symbol)
            options = ticker.options
            if not options:
                return None
                
            fast_info = ticker.fast_info
            last_price = fast_info.get('lastPrice', None)
            if not last_price:
                hist = ticker.history(period="1d")
                if not hist.empty:
                    last_price = hist['Close'].iloc[-1]
                    
            if not last_price:
                return None
                
            today = date.today()
            best_exp = None
            min_diff = 9999
            
            for exp_str in options:
                try:
                    exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
                    diff = abs((exp_date - today).days - 30)
                    if diff < min_diff:
                        min_diff = diff
                        best_exp = exp_str
                except Exception:
                    continue
                    
            if not best_exp:
                best_exp = options[0]
                
            exp_date = datetime.strptime(best_exp, "%Y-%m-%d").date()
            t = max(0.001, (exp_date - today).days / 365.0)
            
            opt_chain = ticker.option_chain(best_exp)
            calls = opt_chain.calls
            puts = opt_chain.puts
            
            calls['strike_diff'] = (calls['strike'] - last_price).abs()
            calls = calls[calls['lastPrice'] > 0.01]
            
            puts['strike_diff'] = (puts['strike'] - last_price).abs()
            puts = puts[puts['lastPrice'] > 0.01]
            
            call_iv = None
            put_iv = None
            r = 0.05
            
            if not calls.empty:
                atm_call = calls.sort_values(by='strike_diff').iloc[0]
                call_iv = find_implied_volatility(atm_call['lastPrice'], last_price, atm_call['strike'], t, r, is_call=True)
                
            if not puts.empty:
                atm_put = puts.sort_values(by='strike_diff').iloc[0]
                put_iv = find_implied_volatility(atm_put['lastPrice'], last_price, atm_put['strike'], t, r, is_call=False)
                
            if call_iv is not None and put_iv is not None:
                return (call_iv + put_iv) / 2
            elif call_iv is not None:
                return call_iv
            elif put_iv is not None:
                return put_iv
        except Exception as e:
            logger.error(f"Error calculating yfinance IV for {symbol}: {e}")
        return None

    async def sync_daily_data(self, symbol: str, db: Session) -> Dict[str, Any]:
        """
        Synchronizes historical candles and daily fundamentals for a given symbol.
        """
        result = {"symbol": symbol, "status": "success", "messages": []}
        
        now = datetime.utcnow()
        # Skip weekends (5 = Saturday, 6 = Sunday)
        if now.weekday() >= 5:
            result["status"] = "skipped"
            result["messages"].append("Skipped sync on weekend.")
            return result
        
        # 1. Determine how much history to fetch
        watchlist_record = db.query(Watchlist).filter(Watchlist.symbol == symbol).first()
        if not watchlist_record:
            watchlist_record = Watchlist(symbol=symbol)
            db.add(watchlist_record)
            
        watchlist_record.last_synced_at = now

        latest_candle = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).first()
        
        needs_full_history = False
        duration = "5 D"
        
        if not latest_candle:
            needs_full_history = True
            duration = "1 Y"
            watchlist_record.last_hard_update_at = now
            result["messages"].append("No existing candles, fetching 1 year history.")
            
        # 2. Fetch candles
        candles = await self.ibkr.get_historical_candles(symbol, duration=duration)
        if not candles:
            candles = self.yahoo.get_historical_candles(symbol, period="1y" if needs_full_history else "5d")
            
        if not candles:
            result["status"] = "error"
            result["messages"].append("Failed to fetch price history.")
            return result
            
        # 3. Check for split/dividend discrepancies if we already had data
        if not needs_full_history and latest_candle:
            cached_dict = {"date": latest_candle.date.strftime("%Y-%m-%d"), "close": latest_candle.close}
            has_split = self.analytics.check_splits_and_dividends(cached_dict, candles)
            watchlist_record.last_split_check_at = now
            
            if has_split:
                result["messages"].append("Split or dividend detected. Wiping history and refetching 1 year.")
                # Wipe existing candles for symbol
                db.execute(delete(Candle).where(Candle.symbol == symbol))
                db.commit()
                
                # Refetch 1 year
                candles = await self.ibkr.get_historical_candles(symbol, duration="1 Y")
                if not candles:
                    candles = self.yahoo.get_historical_candles(symbol, period="1y")
                needs_full_history = True
                watchlist_record.last_hard_update_at = now
                latest_candle = None # Reset so we insert everything
                
        # 4. Insert missing candles
        new_candles_count = 0
        all_closes_for_ma = []
        
        if needs_full_history:
            # We need to compute MAs for the whole set
            closes = [c["close"] for c in candles]
            for i, c in enumerate(candles):
                candle_date = datetime.strptime(c["date"], "%Y-%m-%d").date()
                
                sma20 = self.analytics.compute_sma(closes[:i+1], 20)
                sma50 = self.analytics.compute_sma(closes[:i+1], 50)
                sma200 = self.analytics.compute_sma(closes[:i+1], 200)
                
                db_candle = Candle(
                    symbol=symbol,
                    date=candle_date,
                    open=c["open"],
                    high=c["high"],
                    low=c["low"],
                    close=c["close"],
                    volume=c["volume"],
                    sma_20=sma20,
                    sma_50=sma50,
                    sma_200=sma200
                )
                db.add(db_candle)
                new_candles_count += 1
            db.commit()
        else:
            # Only insert what's newer than latest_candle.date
            # To calculate MA accurately for the new days, we need past 200 days from DB
            past_candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(200).all()
            past_candles.reverse() # Oldest first
            closes_history = [c.close for c in past_candles]
            
            for c in candles:
                candle_date = datetime.strptime(c["date"], "%Y-%m-%d").date()
                if latest_candle and candle_date < latest_candle.date:
                    continue
                
                is_today = latest_candle and candle_date == latest_candle.date
                if is_today:
                    if closes_history:
                        closes_history[-1] = c["close"]
                    else:
                        closes_history.append(c["close"])
                else:
                    closes_history.append(c["close"])
                    
                sma20 = self.analytics.compute_sma(closes_history, 20)
                sma50 = self.analytics.compute_sma(closes_history, 50)
                sma200 = self.analytics.compute_sma(closes_history, 200)
                
                if is_today:
                    # Update existing candle in DB
                    existing_candle = db.query(Candle).filter(
                        Candle.symbol == symbol,
                        Candle.date == candle_date
                    ).first()
                    if existing_candle:
                        existing_candle.open = c["open"]
                        existing_candle.high = c["high"]
                        existing_candle.low = c["low"]
                        existing_candle.close = c["close"]
                        existing_candle.volume = c["volume"]
                        existing_candle.sma_20 = sma20
                        existing_candle.sma_50 = sma50
                        existing_candle.sma_200 = sma200
                else:
                    db_candle = Candle(
                        symbol=symbol,
                        date=candle_date,
                        open=c["open"],
                        high=c["high"],
                        low=c["low"],
                        close=c["close"],
                        volume=c["volume"],
                        sma_20=sma20,
                        sma_50=sma50,
                        sma_200=sma200
                    )
                    db.add(db_candle)
                    new_candles_count += 1
            db.commit()
            
        result["messages"].append(f"Inserted {new_candles_count} new candles.")
        
        # 5. Fetch and compute Fundamentals
        fund_data = self.yahoo.get_fundamentals(symbol)
        if fund_data:
            # Need historical prices for RSI and RVOL
            # Get last 250 candles from DB
            recent_candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(250).all()
            recent_candles.reverse()
            
            rsi = None
            if len(recent_candles) >= 15:
                closes = [c.close for c in recent_candles]
                rsi = self.analytics.compute_rsi(closes)
                
            # Compute RVOL
            rvol = None
            if recent_candles:
                current_vol = recent_candles[-1].volume
                avg_vol = fund_data.get("avg_volume")
                if avg_vol:
                    rvol = self.analytics.compute_rvol(current_vol, avg_vol)
                    
            # Compute Cash Burn / Runway
            burn_rate, runway = self.analytics.compute_financial_health(
                fund_data.get("free_cashflow"),
                fund_data.get("total_cash")
            )
            
            # Upsert today's fundamental
            today = date.today()
            fund_record = db.query(Fundamental).filter(
                Fundamental.symbol == symbol, 
                Fundamental.date == today
            ).first()
            
            if not fund_record:
                fund_record = Fundamental(symbol=symbol, date=today)
                db.add(fund_record)
                
            fund_record.pe = fund_data.get("pe")
            fund_record.forward_pe = fund_data.get("forward_pe")
            fund_record.peg = fund_data.get("peg")
            fund_record.ev_to_revenue = fund_data.get("ev_to_revenue")
            fund_record.roic = fund_data.get("roic")
            fund_record.roe = fund_data.get("roe")
            fund_record.rsi = rsi
            fund_record.avg_volume = fund_data.get("avg_volume")
            fund_record.rvol = rvol
            
            # Get IV from IBKR snapshot if possible
            snapshot = await self.ibkr.get_snapshot(symbol)
            iv_val = None
            if snapshot and snapshot.get("iv"):
                iv_val = snapshot.get("iv")
                
            if iv_val is None:
                logger.info(f"IBKR IV not available for {symbol}. Calculating from yfinance option chain...")
                iv_val = self.calculate_yfinance_iv(symbol)
                
            if iv_val is not None:
                fund_record.iv = iv_val
                
            fund_record.cash_burn_rate = burn_rate
            fund_record.cash_runway = runway
            fund_record.revenue_growth_yoy = fund_data.get("revenue_growth")
            fund_record.short_interest_pct = fund_data.get("short_pct_float")
            
            db.commit()
            result["messages"].append("Fundamentals updated.")
            
            # Compile fundamentals dict for Node.js to upload to Firestore
            raw_fundamentals = {
                "date": today.strftime("%Y-%m-%d"),
                "symbol": symbol,
                "last_price": fund_data.get("last_price"),
                "close_price": fund_data.get("close_price"),
                "open": fund_data.get("open"),
                "high": fund_data.get("high"),
                "low": fund_data.get("low"),
                "volume": fund_data.get("volume"),
                "avg_volume": fund_data.get("avg_volume"),
                "market_cap": fund_data.get("market_cap"),
                "beta": fund_data.get("beta"),
                "pe": fund_data.get("pe"),
                "forward_pe": fund_data.get("forward_pe"),
                "eps": fund_data.get("eps"),
                "forward_eps": fund_data.get("forward_eps"),
                "peg": fund_data.get("peg"),
                "ev_to_ebitda": fund_data.get("ev_to_ebitda"),
                "ev_to_revenue": fund_data.get("ev_to_revenue"),
                "dividend_yield": fund_data.get("dividend_yield"),
                "payout_ratio": fund_data.get("payout_ratio"),
                "profit_margin": fund_data.get("profit_margin") * 100 if fund_data.get("profit_margin") is not None else None,
                "operating_margin": fund_data.get("operating_margin") * 100 if fund_data.get("operating_margin") is not None else None,
                "gross_margin": fund_data.get("gross_margin") * 100 if fund_data.get("gross_margin") is not None else None,
                "revenue_growth": fund_data.get("revenue_growth") * 100 if fund_data.get("revenue_growth") is not None else None,
                "earnings_growth": fund_data.get("earnings_growth") * 100 if fund_data.get("earnings_growth") is not None else None,
                "roe": fund_data.get("roe") * 100 if fund_data.get("roe") is not None else None,
                "roa": fund_data.get("roa") * 100 if fund_data.get("roa") is not None else None,
                "current_ratio": fund_data.get("current_ratio"),
                "de_ratio": fund_data.get("de_ratio"),
                "free_cashflow": fund_data.get("free_cashflow"),
                "short_ratio": fund_data.get("short_ratio"),
                "week52_high": fund_data.get("week52_high"),
                "week52_low": fund_data.get("week52_low"),
                "rsi": rsi,
                "iv": fund_record.iv * 100 if fund_record.iv is not None else None,
            }
            
            # Replace float('nan') or float('inf') or pd.isna values with None to prevent FastAPI serialization errors
            import math
            import pandas as pd
            cleaned_fundamentals = {}
            for k, v in raw_fundamentals.items():
                if v is None:
                    cleaned_fundamentals[k] = None
                elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    cleaned_fundamentals[k] = None
                elif pd.isna(v):
                    cleaned_fundamentals[k] = None
                else:
                    cleaned_fundamentals[k] = v
                    
            result["fundamentals"] = cleaned_fundamentals
        else:
            result["messages"].append("Failed to fetch fundamentals.")
            
        return result
