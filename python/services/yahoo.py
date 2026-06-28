import logging
from typing import Dict, Any, Optional, List
import yfinance as yf
import pandas as pd

logger = logging.getLogger("smart_analyser.yahoo")

class YahooService:
    def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            if not info:
                return None
            
            # Map parameters with safe gets
            return {
                # Price / market data
                "last_price": info.get("currentPrice") or info.get("regularMarketPrice") or None,
                "close_price": info.get("previousClose") or info.get("regularMarketPreviousClose") or None,
                "open": info.get("open") or info.get("regularMarketOpen") or None,
                "high": info.get("dayHigh") or info.get("regularMarketDayHigh") or None,
                "low": info.get("dayLow") or info.get("regularMarketDayLow") or None,
                "volume": info.get("volume") or info.get("regularMarketVolume") or None,
                "week52_high": info.get("fiftyTwoWeekHigh") or None,
                "week52_low": info.get("fiftyTwoWeekLow") or None,
                "avg_volume": info.get("averageVolume") or info.get("averageDailyVolume10Day") or None,
                
                # Valuation
                "pe": info.get("trailingPE") or None,
                "forward_pe": info.get("forwardPE") or None,
                "peg": info.get("pegRatio") or None,
                "price_to_book": info.get("priceToBook") or None,
                "ev": info.get("enterpriseValue") or None,
                "ev_to_ebitda": info.get("enterpriseToEbitda") or None,
                "ev_to_revenue": info.get("enterpriseToRevenue") or None,

                # Earnings
                "eps": info.get("trailingEps") or None,
                "forward_eps": info.get("forwardEps") or None,
                "earnings_growth": info.get("earningsGrowth") or None,
                "revenue_growth": info.get("revenueGrowth") or None,

                # Market
                "market_cap": info.get("marketCap") or None,
                "beta": info.get("beta") or None,

                # Profitability
                "roe": info.get("returnOnEquity") or None,
                "roa": info.get("returnOnAssets") or None,
                "gross_margin": info.get("grossMargins") or None,
                "operating_margin": info.get("operatingMargins") or None,
                "profit_margin": info.get("profitMargins") or None,

                # Financial health
                "de_ratio": info.get("debtToEquity") or None,
                "current_ratio": info.get("currentRatio") or None,
                "quick_ratio": info.get("quickRatio") or None,
                "free_cashflow": info.get("freeCashflow") or None,
                "total_cash": info.get("totalCash") or None,

                # Dividends
                "dividend_yield": info.get("dividendYield") or None,
                "payout_ratio": info.get("payoutRatio") or None,

                # Short interest
                "short_ratio": info.get("shortRatio") or None,
                "short_pct_float": info.get("shortPercentOfFloat") or None,
                
                # Added fundamental metrics
                "roic": info.get("returnOnCapitalEmployed") or self._calculate_roic(ticker),
            }
        except Exception as e:
            logger.error(f"Error fetching Yahoo fundamentals for {symbol}: {e}")
            return None

    def _calculate_roic(self, ticker: yf.Ticker) -> Optional[float]:
        try:
            # ROIC = NOPAT / Invested Capital
            # NOPAT = Operating Income * (1 - Tax Rate)
            # Invested Capital = Total Assets - Current Liabilities
            
            financials = ticker.financials
            balance_sheet = ticker.balance_sheet
            
            if financials is None or balance_sheet is None or financials.empty or balance_sheet.empty:
                return None
                
            # Get the most recent column (usually iloc[:, 0])
            fin_recent = financials.iloc[:, 0]
            bs_recent = balance_sheet.iloc[:, 0]
            
            op_inc = fin_recent.get("Operating Income")
            tax_prov = fin_recent.get("Tax Provision", 0)
            pretax_inc = fin_recent.get("Pretax Income")
            
            tot_assets = bs_recent.get("Total Assets")
            curr_liab = bs_recent.get("Current Liabilities")
            
            if pd.isna(op_inc) or pd.isna(tot_assets) or pd.isna(curr_liab):
                return None
                
            # Calculate tax rate
            tax_rate = 0.21 # default corporate
            if not pd.isna(tax_prov) and not pd.isna(pretax_inc) and pretax_inc != 0:
                tax_rate = max(0, tax_prov / pretax_inc)
                
            nopat = op_inc * (1 - tax_rate)
            invested_capital = tot_assets - curr_liab
            
            if invested_capital <= 0:
                return None
                
            roic = nopat / invested_capital
            return float(round(roic, 4))
        except Exception as e:
            logger.debug(f"Could not calculate ROIC: {e}")
            return None

    def get_historical_candles(self, symbol: str, period: str = "1y", interval: str = "1d") -> List[Dict[str, Any]]:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period=period, interval=interval)
            if hist.empty:
                return []
            
            result = []
            for index, row in hist.iterrows():
                result.append({
                    "date": index.strftime("%Y-%m-%d"),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"])
                })
            return result
        except Exception as e:
            logger.error(f"Error fetching Yahoo historical data for {symbol}: {e}")
            return []
