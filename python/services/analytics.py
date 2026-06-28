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
        """Detects Golden Cross (MA50 crossing above MA200) and Death Cross (MA50 crossing below MA200)."""
        result = {"golden_cross": False, "death_cross": False}
        if len(prices) < 201:
            return result
        
        # We need the last two values of both MA50 and MA200 to detect a cross
        ma50_today = self.compute_sma(prices, 50)
        ma200_today = self.compute_sma(prices, 200)
        
        # Previous day's MAs
        prices_prev = prices[:-1]
        ma50_prev = self.compute_sma(prices_prev, 50)
        ma200_prev = self.compute_sma(prices_prev, 200)
        
        if None in (ma50_today, ma200_today, ma50_prev, ma200_prev):
            return result
            
        # Check cross conditions
        if ma50_prev <= ma200_prev and ma50_today > ma200_today:
            result["golden_cross"] = True
        elif ma50_prev >= ma200_prev and ma50_today < ma200_today:
            result["death_cross"] = True
            
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
