import logging
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from database.models import Candle, Fundamental
from services.analytics import AnalyticsService
import numpy as np

logger = logging.getLogger("smart_analyser.options_signals")

class OptionsSignalsService:
    def __init__(self):
        self.analytics = AnalyticsService()

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
            
        min_iv = min(ivs)
        max_iv = max(ivs)
        
        if max_iv > min_iv:
            return round(((current_iv - min_iv) / (max_iv - min_iv)) * 100, 1)
        return 50.0

    async def scan_signals(self, db: Session, watchlist: List[str], send_telegram: bool = False) -> List[Dict[str, Any]]:
        signals = []
        
        for symbol in watchlist:
            symbol = symbol.upper()
            try:
                # Query last 50 daily candles
                candles = db.query(Candle).filter(Candle.symbol == symbol).order_by(Candle.date.desc()).limit(50).all()
                if not candles or len(candles) < 20:
                    logger.warning(f"[Signals] Not enough candles for {symbol}. Skipping.")
                    continue
                
                # Reverse candles to chronological order
                candles.reverse()
                closes = [c.close for c in candles]
                last_price = closes[-1]
                
                # Fetch latest Fundamental data
                latest_fund = db.query(Fundamental).filter(
                    Fundamental.symbol == symbol
                ).order_by(Fundamental.date.desc()).first()
                
                current_iv = latest_fund.iv if (latest_fund and latest_fund.iv) else None
                iv_rank = self.calculate_iv_rank(db, symbol, current_iv) if current_iv else None
                
                # Calculate RSI
                rsi = self.analytics.compute_rsi(closes)
                
                # Calculate Bollinger Bands
                period = 20
                period_closes = closes[-period:]
                sma = np.mean(period_closes)
                std = np.std(period_closes)
                upper_bb = sma + (2.0 * std)
                lower_bb = sma - (2.0 * std)
                
                # Signal checks
                # 1. Put Selling (Bullish/Oversold + High IV Rank)
                # close is near or below lower BB (within 2% buffer)
                is_near_lower_bb = last_price <= (lower_bb * 1.02)
                is_oversold_rsi = rsi is not None and rsi <= 45
                is_high_iv = iv_rank is not None and iv_rank >= 40
                
                # 2. Call Selling (Bearish/Overbought + High IV Rank)
                is_near_upper_bb = last_price >= (upper_bb * 0.98)
                is_overbought_rsi = rsi is not None and rsi >= 60
                
                sig_type = None
                msg = ""
                
                if is_near_lower_bb and is_oversold_rsi and is_high_iv:
                    sig_type = "SELL_PUT"
                    msg = (
                        f"🔥 **{symbol} PUT SATIŞ FIRSATI**\n"
                        f"• Fiyat: ${last_price:.2f} (BB Alt Bandına Yakın: ${lower_bb:.2f})\n"
                        f"• RSI: {rsi:.1f} (Aşırı Satım)\n"
                        f"• IV Rank: %{iv_rank:.1f} (Yüksek Prim Geliri!)\n"
                        f"• Günlük Trend: Destek bölgesine yakın, prim satışı için ideal."
                    )
                elif is_near_upper_bb and is_overbought_rsi and is_high_iv:
                    sig_type = "SELL_CALL"
                    msg = (
                        f"⚡ **{symbol} CALL SATIŞ FIRSATI**\n"
                        f"• Fiyat: ${last_price:.2f} (BB Üst Bandına Yakın: ${upper_bb:.2f})\n"
                        f"• RSI: {rsi:.1f} (Aşırı Alım)\n"
                        f"• IV Rank: %{iv_rank:.1f} (Yüksek Prim Geliri!)\n"
                        f"• Günlük Trend: Direnç bölgesine yakın, prim satışı için ideal."
                    )
                    
                if sig_type:
                    # Check if signal already sent in last 12 hours
                    from database.models import OptionSignalLog
                    from datetime import datetime, timedelta
                    
                    twelve_hours_ago = datetime.utcnow() - timedelta(hours=12)
                    recent_log = db.query(OptionSignalLog).filter(
                        OptionSignalLog.symbol == symbol,
                        OptionSignalLog.signal_type == sig_type,
                        OptionSignalLog.generated_at >= twelve_hours_ago
                    ).first()
                    
                    if recent_log:
                        logger.info(f"[Signals] Skip sending {symbol} {sig_type} because it was already sent at {recent_log.generated_at}")
                        continue
                        
                    # Send telegram message if requested
                    if send_telegram:
                        try:
                            from services.telegram import TelegramService
                            telegram = TelegramService()
                            await telegram.send_message(msg)
                            
                            # Log signal to DB
                            signal_log = OptionSignalLog(
                                symbol=symbol,
                                signal_type=sig_type,
                                generated_at=datetime.utcnow()
                            )
                            db.add(signal_log)
                            db.commit()
                            logger.info(f"[Signals] Alert sent and logged for {symbol} {sig_type}")
                        except Exception as tel_err:
                            logger.error(f"[Signals] Failed to send Telegram message: {tel_err}")
                            db.rollback()
                            
                    signals.append({
                        "symbol": symbol,
                        "type": sig_type,
                        "price": last_price,
                        "rsi": rsi,
                        "iv": current_iv,
                        "iv_rank": iv_rank,
                        "lower_bb": round(lower_bb, 2),
                        "upper_bb": round(upper_bb, 2),
                        "sma20": round(sma, 2),
                        "message": msg
                    })
            except Exception as e:
                logger.error(f"[Signals] Error scanning {symbol}: {e}")
                
        return signals
