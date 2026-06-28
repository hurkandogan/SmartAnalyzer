import logging
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("smart_analyser.analytics")

class AnalyticsService:
    def compute_rsi(self, prices: List[float], period: int = 14) -> Optional[float]:
        """Calculates Wilder-smoothed RSI(14) matching TradingView exactly."""
        if len(prices) < period + 1:
            return None
        
        deltas = np.diff(prices)
        seed = deltas[:period]
        
        up = seed[seed >= 0].sum() / period
        down = -seed[seed < 0].sum() / period
        
        # Avoid division by zero
        if down == 0:
            rs = 100.0
        else:
            rs = up / down
            
        rsi = np.zeros_like(prices)
        rsi[:period] = 100.0 - 100.0 / (1.0 + rs)
        
        # Wilder's smoothing
        up_avg = up
        down_avg = down
        for i in range(period, len(deltas)):
            delta = deltas[i]
            if delta > 0:
                up_val = delta
                down_val = 0.0
            else:
                up_val = 0.0
                down_val = -delta
                
            up_avg = (up_avg * (period - 1) + up_val) / period
            down_avg = (down_avg * (period - 1) + down_val) / period
            
            if down_avg == 0:
                rsi[i+1] = 100.0
            else:
                rs = up_avg / down_avg
                rsi[i+1] = 100.0 - 100.0 / (1.0 + rs)
                
        return float(round(rsi[-1], 2))

    def compute_sma(self, prices: List[float], period: int) -> Optional[float]:
        if len(prices) < period:
            return None
        return float(round(sum(prices[-period:]) / period, 2))

    def detect_crosses(self, prices: List[float]) -> Dict[str, Any]:
        """Detects Golden Cross (MA50 crossing above MA200) and Death Cross (MA50 crossing below MA200).
           Also predicts if a cross is approaching within a ~2% threshold."""
        result = {"golden_cross": False, "death_cross": False, "gc_coming": False, "dc_coming": False}
        if len(prices) < 201:
            return result
        
        ma50_today = self.compute_sma(prices, 50)
        ma200_today = self.compute_sma(prices, 200)
        
        prices_prev = prices[:-1]
        ma50_prev = self.compute_sma(prices_prev, 50)
        ma200_prev = self.compute_sma(prices_prev, 200)
        
        if None in (ma50_today, ma200_today, ma50_prev, ma200_prev):
            return result
            
        # Exact crosses
        if ma50_prev <= ma200_prev and ma50_today > ma200_today:
            result["golden_cross"] = True
        elif ma50_prev >= ma200_prev and ma50_today < ma200_today:
            result["death_cross"] = True
            
        # Prediction / Approaching logic
        # If no exact cross today, check if they are close (within 2%) and converging
        if not result["golden_cross"] and not result["death_cross"]:
            diff_today = ma50_today - ma200_today
            diff_prev = ma50_prev - ma200_prev
            
            # Distance as percentage of MA200
            dist_pct = abs(diff_today) / ma200_today
            
            # If distance is less than 2% and the gap is closing
            if dist_pct < 0.02 and abs(diff_today) < abs(diff_prev):
                if diff_today < 0:
                    # MA50 is below MA200 but approaching upwards -> GC coming
                    result["gc_coming"] = True
                elif diff_today > 0:
                    # MA50 is above MA200 but approaching downwards -> DC coming
                    result["dc_coming"] = True
                    
        return result

    def check_splits_and_dividends(
        self, 
        cached_candle: Dict[str, Any], 
        live_candles: List[Dict[str, Any]]
    ) -> bool:
        """
        Compares a cached daily close against live historical candles.
        Returns True if a discrepancy (split or dividend adjustment) is detected.
        """
        target_date = cached_candle.get("date")
        cached_close = cached_candle.get("close")
        if not target_date or cached_close is None:
            return False
            
        # Find the matching date in the live candles
        live_match = next((c for c in live_candles if c["date"] == target_date), None)
        if not live_match:
            return False
            
        live_close = live_match.get("close")
        if live_close is None:
            return False
            
        # Discrepancy greater than 0.5% indicates adjustment (split/dividend/etc.)
        discrepancy = abs(cached_close - live_close) / live_close
        if discrepancy > 0.005:
            logger.warning(
                f"Discrepancy detected for candle on {target_date}: "
                f"Cached Close: {cached_close}, Live Close: {live_close} (Diff: {discrepancy:.2%})"
            )
            return True
            
        return False

    def compute_rvol(self, current_volume: Optional[float], avg_volume: Optional[float]) -> Optional[float]:
        """Calculates Relative Volume (RVOL)"""
        if current_volume is None or avg_volume is None or avg_volume == 0:
            return None
        return float(round(current_volume / avg_volume, 2))

    def compute_financial_health(self, free_cashflow: Optional[float], total_cash: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
        """
        Returns (cash_burn_rate, cash_runway).
        Cash burn rate is positive if they are burning cash (negative FCF).
        Cash runway is in years (total_cash / cash_burn_rate) if burning cash.
        If they are generating cash (positive FCF), runway is None (infinite).
        """
        cash_burn_rate = None
        cash_runway = None
        
        if free_cashflow is not None:
            if free_cashflow < 0:
                cash_burn_rate = abs(free_cashflow)
                if total_cash is not None and cash_burn_rate > 0:
                    cash_runway = float(round(total_cash / cash_burn_rate, 2))
            else:
                # Not burning cash
                cash_burn_rate = 0.0
                cash_runway = None  # Infinite
                
        return cash_burn_rate, cash_runway

    def generate_insights(self, fundamentals: Dict[str, Any], analytics_data: Dict[str, Any]) -> str:
        """
        Generates automated text commentary (insights) evaluating thresholds.
        Returns a single combined HTML string with insights.
        """
        comments = []
        
        # Technicals
        rsi = fundamentals.get("rsi")
        if rsi is not None:
            if rsi <= 30:
                comments.append(f"🟢 **Oversold:** RSI is critically low at {rsi:.1f}, indicating a potential reversal or bounce.")
            elif rsi >= 70:
                comments.append(f"🔴 **Overbought:** RSI is extremely high at {rsi:.1f}, a correction might be imminent.")
                
        # Crosses
        if analytics_data.get("golden_cross"):
            comments.append("🌟 **Golden Cross confirmed!** The 50-day moving average just crossed above the 200-day moving average. Strong bullish signal.")
        elif analytics_data.get("death_cross"):
            comments.append("⚠️ **Death Cross confirmed!** The 50-day moving average just crossed below the 200-day moving average. Strong bearish signal.")
        elif analytics_data.get("gc_coming"):
            comments.append("⏳ **Golden Cross Approaching:** The MA50 is converging upwards towards the MA200. Keep a close watch in the coming days.")
        elif analytics_data.get("dc_coming"):
            comments.append("📉 **Death Cross Approaching:** The MA50 is converging downwards towards the MA200. Caution advised if price doesn't recover.")
            
        # Fundamentals
        de_ratio = fundamentals.get("de_ratio")
        if de_ratio is not None and de_ratio > 2.0:
            comments.append(f"⚠️ **High Debt:** Debt-to-Equity ratio is high at {de_ratio:.2f}, indicating significant leverage risk.")
            
        pe = fundamentals.get("pe")
        if pe is not None:
            if pe < 10 and pe > 0:
                comments.append(f"🟢 **Value Territory:** P/E ratio is highly attractive at {pe:.2f}.")
            elif pe > 50:
                comments.append(f"🔴 **Overvalued:** P/E ratio is quite high at {pe:.2f}, pricing in massive growth expectations.")
                
        iv = fundamentals.get("iv")
        if iv is not None and iv > 0.8:
            comments.append(f"⚡ **High Volatility:** Implied Volatility is extremely high at {iv*100:.1f}%. Expect large price swings.")
            
        if not comments:
            return ""
            
        # Combine comments
        header = "🤖 **AI Analysis Summary:**\n"
        return header + "\n".join([f"- {c}" for c in comments])
