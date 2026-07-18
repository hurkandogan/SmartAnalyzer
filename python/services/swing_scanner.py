import logging
from typing import List, Dict, Any
import httpx
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database.models import Watchlist, Candle, Fundamental
from services.telegram import TelegramService

logger = logging.getLogger("smart_analyser.swing")

class SwingScannerService:
    def __init__(self, telegram: TelegramService):
        self.telegram = telegram

    async def scan_signals(self, db: Session, send_telegram: bool = True) -> List[Dict[str, Any]]:
        logger.info("Starting Swing Scanner for Watchlist symbols.")
        signals = []
        
        # 1. Get watchlist symbols
        watchlist_records = db.query(Watchlist).all()
        symbols = [w.symbol for w in watchlist_records]
        
        for symbol in symbols:
            # 2. Get latest Fundamental
            fund = db.query(Fundamental).filter(Fundamental.symbol == symbol).order_by(desc(Fundamental.date)).first()
            # 3. Get latest Candle
            candle = db.query(Candle).filter(Candle.symbol == symbol).order_by(desc(Candle.date)).first()
            
            if not fund or not candle:
                continue
                
            score = fund.score or 0
            rsi = fund.rsi or 50.0
            close = candle.close or 0
            sma_50 = candle.sma_50
            sma_200 = candle.sma_200
            
            if close <= 0:
                continue

            # Signal logic
            signal_type = None
            signal_msg = ""
            action = ""
            
            # 1. Oversold Fundamental Gem
            if rsi < 30 and score >= 75:
                signal_type = "Oversold"
                action = "STRONG BUY"
                signal_msg = f"RSI is extremely oversold ({rsi:.1f}) but fundamentals are very strong (Score: {score})."
            
            # 2. Pullback to 50 SMA
            elif sma_50 and sma_200 and score >= 70 and abs(close - sma_50) / close < 0.02 and close > sma_200:
                signal_type = "Pullback"
                action = "BUY"
                signal_msg = f"Price (${close:.2f}) is resting on 50 SMA (${sma_50:.2f}) in a long-term uptrend."
                
            # 3. Overbought Weakness
            elif rsi > 70 and score < 40:
                signal_type = "Overbought"
                action = "SELL"
                signal_msg = f"RSI is overbought ({rsi:.1f}) and fundamentals are weak (Score: {score})."
                
            if signal_type:
                setup = {
                    "symbol": symbol,
                    "date": datetime.now().isoformat(),
                    "type": signal_type,
                    "action": action,
                    "message": signal_msg,
                    "score": score,
                    "rsi": rsi,
                    "price": close,
                }
                signals.append(setup)
                
                # Send Telegram alert
                if send_telegram:
                    msg = (
                        f"🎯 <b>SWING SETUP: {symbol}</b>\n"
                        f"Action: <b>{action}</b>\n"
                        f"Type: {signal_type}\n"
                        f"Price: ${close:.2f}\n"
                        f"RSI: {rsi:.1f}\n"
                        f"Score: {score}/100\n\n"
                        f"<i>{signal_msg}</i>"
                    )
                    await self.telegram.send_message(msg, channel="private")

        # Push to Firebase
        if signals:
            try:
                hono_url = "http://localhost:3500/api/swing-signals"
                async with httpx.AsyncClient() as client:
                    await client.post(hono_url, json={"signals": signals})
                logger.info(f"Pushed {len(signals)} swing signals to Firebase via Hono.")
            except Exception as e:
                logger.error(f"Failed to push swing signals to Firebase: {e}")
                
        return signals
