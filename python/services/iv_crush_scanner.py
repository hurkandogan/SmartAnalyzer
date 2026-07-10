import logging
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import yfinance as yf
from database.models import Fundamental, Candle
from services.ibkr import IBKRService
from ib_insync import Stock, Option
import asyncio

logger = logging.getLogger("smart_analyser.iv_crush_scanner")

class IVCrushScannerService:
    def __init__(self):
        self.ibkr_service = IBKRService(port=7497, client_id=101)  # Dedicated client ID for scanner

    def get_upcoming_earnings(self, symbol: str) -> Optional[datetime.date]:
        try:
            ticker = yf.Ticker(symbol)
            calendar = ticker.calendar
            if calendar and 'Earnings Date' in calendar:
                earnings_dates = calendar['Earnings Date']
                if earnings_dates:
                    # Return the first upcoming date
                    for date in earnings_dates:
                        if date >= datetime.date.today():
                            return date
        except Exception as e:
            logger.warning(f"[IVCrushScanner] Failed to fetch earnings for {symbol} via yfinance: {e}")
        return None

    def calculate_iv_rank(self, db: Session, symbol: str, current_iv: float) -> Optional[float]:
        if current_iv is None or current_iv <= 0:
            return None
            
        one_year_ago = datetime.date.today() - datetime.timedelta(days=365)
        records = db.query(Fundamental.iv).filter(
            Fundamental.symbol == symbol,
            Fundamental.date >= one_year_ago,
            Fundamental.iv.isnot(None),
            Fundamental.iv > 0
        ).all()
        
        ivs = [r[0] for r in records]
        if current_iv not in ivs:
            ivs.append(current_iv)
            
        if not ivs:
            return 50.0

        min_iv = min(ivs)
        max_iv = max(ivs)
        
        if max_iv > min_iv:
            return round(((current_iv - min_iv) / (max_iv - min_iv)) * 100, 1)
        return 50.0

    async def _fetch_ibkr_options(self, symbol: str, earnings_date: datetime.date, current_price: float) -> Dict[str, Any]:
        """
        Connects to IBKR to fetch the option chain targeting expiration > earnings_date + 7 days
        and returning put and call with delta ~ 0.20
        """
        result = {}
        connected = await self.ibkr_service.connect()
        if not connected:
            logger.error("[IVCrushScanner] Failed to connect to IBKR.")
            return result
            
        ib = self.ibkr_service.ib
        
        try:
            stock = Stock(symbol, 'SMART', 'USD')
            await ib.qualifyContractsAsync(stock)
            
            chains = await ib.reqSecDefOptParamsAsync(stock.symbol, '', stock.secType, stock.conId)
            if not chains:
                return result
                
            # Filter for SMART exchange
            try:
                chain = next(c for c in chains if c.exchange == 'SMART')
            except StopIteration:
                return result
                
            # Target expiration at least 7-10 days AFTER earnings
            target_min_date_str = (earnings_date + datetime.timedelta(days=7)).strftime('%Y%m%d')
            
            valid_expirations = [e for e in chain.expirations if e >= target_min_date_str]
            if not valid_expirations:
                return result
                
            target_exp = sorted(valid_expirations)[0] # Nearest valid
            result['target_expiration'] = target_exp
            
            # Fetch options for +/- 25% from current price to find ~20 Delta
            strikes = [s for s in chain.strikes if current_price * 0.75 < s < current_price * 1.25]
            
            contracts = [Option(symbol, target_exp, s, right, 'SMART') 
                         for right in ['C', 'P'] 
                         for s in strikes]
                         
            contracts = await ib.qualifyContractsAsync(*contracts)
            if not contracts:
                 return result
                 
            tickers = await ib.reqTickersAsync(*contracts)
            
            # Find closest to 20 delta for Puts (-0.20) and Calls (0.20)
            best_put = None
            best_call = None
            min_put_diff = 1.0
            min_call_diff = 1.0
            
            for t in tickers:
                if t.modelGreeks and t.modelGreeks.delta and not str(t.modelGreeks.delta) == 'nan':
                    delta = t.modelGreeks.delta
                    opt = t.contract
                    
                    if opt.right == 'P':
                        diff = abs(delta - (-0.20))
                        if diff < min_put_diff:
                            min_put_diff = diff
                            best_put = t
                    elif opt.right == 'C':
                        diff = abs(delta - 0.20)
                        if diff < min_call_diff:
                            min_call_diff = diff
                            best_call = t
            
            if best_put:
                opt = best_put.contract
                result['put_suggestion'] = {
                    'strike': opt.strike,
                    'bid': best_put.bid,
                    'ask': best_put.ask,
                    'iv': best_put.impliedVolatility,
                    'delta': best_put.modelGreeks.delta
                }
            if best_call:
                opt = best_call.contract
                result['call_suggestion'] = {
                    'strike': opt.strike,
                    'bid': best_call.bid,
                    'ask': best_call.ask,
                    'iv': best_call.impliedVolatility,
                    'delta': best_call.modelGreeks.delta
                }
                
        except Exception as e:
            logger.error(f"[IVCrushScanner] Error fetching option data for {symbol}: {e}")
        finally:
            if ib.isConnected():
                ib.disconnect()
                
        return result


    async def scan_signals(self, db: Session, watchlist: List[str], send_telegram: bool = False) -> List[Dict[str, Any]]:
        signals = []
        today = datetime.date.today()
        
        for symbol in watchlist:
            symbol = symbol.upper()
            try:
                # 1. Earnings Check (Next 1-10 days)
                earnings_date = self.get_upcoming_earnings(symbol)
                if not earnings_date:
                    continue
                    
                days_to_earnings = (earnings_date - today).days
                if not (0 <= days_to_earnings <= 10):
                    continue
                    
                # 2. Get IV from Database
                latest_fund = db.query(Fundamental).filter(
                    Fundamental.symbol == symbol
                ).order_by(Fundamental.date.desc()).first()
                
                current_iv = latest_fund.iv if (latest_fund and latest_fund.iv) else None
                if not current_iv:
                    continue
                    
                iv_rank = self.calculate_iv_rank(db, symbol, current_iv)
                
                # 3. Filter for High IV Rank
                # The user wants good opportunities, let's say IV Rank > 50
                if iv_rank is None or iv_rank < 50.0:
                    continue
                    
                # 4. Fetch current price
                latest_candle = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).first()
                current_price = latest_candle.close if latest_candle else None
                if not current_price:
                     continue
                     
                logger.info(f"[IVCrushScanner] Found opportunity for {symbol} (Earnings in {days_to_earnings} days, IVR: {iv_rank}%)")
                     
                # 5. Fetch IBKR Option suggestions (Gamma protected, ~20 delta, 7+ days after earnings)
                ibkr_data = await self._fetch_ibkr_options(symbol, earnings_date, current_price)
                
                signal = {
                    "symbol": symbol,
                    "earnings_date": earnings_date.isoformat(),
                    "days_to_earnings": days_to_earnings,
                    "current_price": current_price,
                    "iv": current_iv,
                    "iv_rank": iv_rank,
                    "ibkr_options": ibkr_data
                }
                signals.append(signal)
                
                if send_telegram:
                    from services.telegram import TelegramService
                    telegram = TelegramService()
                    msg = (
                        f"🚀 **IV Crush Fırsatı: {symbol}**\n"
                        f"• Bilanço: {days_to_earnings} gün sonra\n"
                        f"• IV Rank: %{iv_rank:.1f} (Çok Şişkin!)\n"
                    )
                    
                    if 'put_suggestion' in ibkr_data:
                        msg += f"• Önerilen Güvenli Put: ${ibkr_data['put_suggestion']['strike']} Strike (Delta: {ibkr_data['put_suggestion']['delta']:.2f})\n"
                        
                    msg += "Detaylı zincir seviyeleri ve primler Metrixfolio Radarı'nda!"
                    await telegram.send_message(msg)

            except Exception as e:
                logger.error(f"[IVCrushScanner] Error scanning {symbol}: {e}")
                
        return signals
