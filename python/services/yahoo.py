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
            res = {
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
                "target_mean_price": info.get("targetMeanPrice") or None,
                "target_high_price": info.get("targetHighPrice") or None,

                # Historical CAGR
                "revenue_cagr_5y": self._calculate_cagr_5y(ticker, "Total Revenue"),
                "net_income_cagr_5y": self._calculate_cagr_5y(ticker, "Net Income"),

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
                
                # Screener / Heatmap additions
                "operating_cashflow": info.get("operatingCashflow") or None,
                "ebitda": info.get("ebitda") or None,
                "sma_200": info.get("twoHundredDayAverage") or None,
                "sector": info.get("sector") or None,
                "industry": info.get("industry") or None,
                "performance_1y": info.get("52WeekChange") or None,
            }
            
            # Calculate Net Debt
            total_debt = info.get("totalDebt")
            total_cash = info.get("totalCash")
            if total_debt is not None and total_cash is not None:
                res["net_debt"] = total_debt - total_cash
            else:
                res["net_debt"] = None
                
            # Calculate Net Debt to EBITDA
            if res["net_debt"] is not None and res["ebitda"] and res["ebitda"] > 0:
                res["net_debt_to_ebitda"] = res["net_debt"] / res["ebitda"]
            else:
                res["net_debt_to_ebitda"] = None
                
            # Try to calculate FCF Growth YoY
            res["fcf_growth_yoy"] = self._calculate_fcf_growth_yoy(ticker)
            
            return res
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

    def _calculate_fcf_growth_yoy(self, ticker: yf.Ticker) -> Optional[float]:
        try:
            cashflow = ticker.cashflow
            if cashflow is None or cashflow.empty or cashflow.shape[1] < 2:
                return None
                
            # Get the first two columns (most recent and previous year)
            recent = cashflow.iloc[:, 0]
            previous = cashflow.iloc[:, 1]
            
            fcf_recent = recent.get("Free Cash Flow")
            fcf_prev = previous.get("Free Cash Flow")
            
            if pd.isna(fcf_recent) or pd.isna(fcf_prev) or fcf_prev == 0:
                return None
                
            growth = (fcf_recent - fcf_prev) / abs(fcf_prev)
            return float(round(growth, 4))
        except Exception as e:
            logger.debug(f"Could not calculate FCF Growth: {e}")
            return None

    def _calculate_cagr_5y(self, ticker: yf.Ticker, field_name: str) -> Optional[float]:
        try:
            financials = ticker.financials
            if financials is None or financials.empty:
                return None
            
            if field_name not in financials.index:
                return None
            
            row = financials.loc[field_name].dropna()
            if len(row) < 3: # Need at least 3 years to calculate a meaningful CAGR
                return None
                
            # Most recent is row.iloc[0], oldest is row.iloc[-1]
            end_val = row.iloc[0]
            start_val = row.iloc[-1]
            periods = len(row) - 1
            
            if start_val <= 0 or end_val <= 0:
                return None
                
            cagr = (end_val / start_val) ** (1 / periods) - 1
            return float(round(cagr, 4))
        except Exception:
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

    def get_ticker_news(self, symbol: str) -> List[Dict[str, Any]]:
        try:
            ticker = yf.Ticker(symbol)
            return ticker.news or []
        except Exception as e:
            logger.error(f"Error fetching news for {symbol}: {e}")
            return []

    def get_earnings_date(self, symbol: str) -> Optional[str]:
        try:
            ticker = yf.Ticker(symbol)
            calendar = ticker.calendar
            if calendar and "Earnings Date" in calendar:
                dates = calendar["Earnings Date"]
                if dates and len(dates) > 0:
                    d = dates[0]
                    if hasattr(d, "strftime"):
                        return d.strftime("%Y-%m-%d")
                    return str(d)
        except Exception as e:
            logger.warning(f"Error fetching earnings date for {symbol}: {e}")
        return None

