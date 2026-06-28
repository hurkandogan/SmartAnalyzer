import logging
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import delete

from database.models import Candle, Fundamental, Watchlist
from services.ibkr import IBKRService
from services.yahoo import YahooService
from services.analytics import AnalyticsService

logger = logging.getLogger("smart_analyser.sync")

class SyncService:
    def __init__(self, ibkr: IBKRService, yahoo: YahooService, analytics: AnalyticsService):
        self.ibkr = ibkr
        self.yahoo = yahoo
        self.analytics = analytics

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
                if latest_candle and candle_date <= latest_candle.date:
                    continue
                    
                closes_history.append(c["close"])
                sma20 = self.analytics.compute_sma(closes_history, 20)
                sma50 = self.analytics.compute_sma(closes_history, 50)
                sma200 = self.analytics.compute_sma(closes_history, 200)
                
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
            if snapshot and snapshot.get("iv"):
                fund_record.iv = snapshot.get("iv")
                
            fund_record.cash_burn_rate = burn_rate
            fund_record.cash_runway = runway
            fund_record.revenue_growth_yoy = fund_data.get("revenue_growth")
            fund_record.short_interest_pct = fund_data.get("short_pct_float")
            
            db.commit()
            result["messages"].append("Fundamentals updated.")
        else:
            result["messages"].append("Failed to fetch fundamentals.")
            
        return result
