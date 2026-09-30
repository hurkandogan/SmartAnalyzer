import logging
from typing import Dict, Any, Optional, List
import yfinance as yf
import pandas as pd

from utils.fundamentals_metrics import (
    coerce_float,
    resolve_pe,
    resolve_peg,
    yahoo_debt_to_equity_to_ratio,
)

logger = logging.getLogger("smart_analyser.yahoo")

class YahooService:
    def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        try:
            ticker = yf.Ticker(symbol)
            info = {}
            try:
                if hasattr(ticker, "get_info"):
                    info = ticker.get_info() or {}
            except Exception as info_err:
                logger.debug(f"ticker.get_info failed for {symbol}: {info_err}")
            if not info:
                info = ticker.info or {}
            if not info:
                return None

            last_price = coerce_float(info.get("currentPrice")) or coerce_float(info.get("regularMarketPrice"))
            trailing_eps = coerce_float(info.get("trailingEps"))
            pe = resolve_pe(
                trailing_pe=info.get("trailingPE"),
                price=last_price,
                trailing_eps=trailing_eps,
            )
            peg = resolve_peg(
                peg=info.get("pegRatio") or info.get("trailingPegRatio"),
                pe=pe,
                earnings_growth=info.get("earningsGrowth") or info.get("earningsQuarterlyGrowth"),
            )
            if pe is None:
                logger.warning(f"[{symbol}] PE missing after trailingPE and price/EPS fallback")
            if peg is None:
                logger.warning(f"[{symbol}] PEG missing after pegRatio and PE/growth fallback")
            
            # Map parameters with safe gets
            res = {
                # Price / market data
                "last_price": last_price,
                "close_price": coerce_float(info.get("previousClose")) or coerce_float(info.get("regularMarketPreviousClose")),
                "open": coerce_float(info.get("open")) or coerce_float(info.get("regularMarketOpen")),
                "high": coerce_float(info.get("dayHigh")) or coerce_float(info.get("regularMarketDayHigh")),
                "low": coerce_float(info.get("dayLow")) or coerce_float(info.get("regularMarketDayLow")),
                "volume": coerce_float(info.get("volume")) or coerce_float(info.get("regularMarketVolume")),
                "week52_high": coerce_float(info.get("fiftyTwoWeekHigh")),
                "week52_low": coerce_float(info.get("fiftyTwoWeekLow")),
                "avg_volume": coerce_float(info.get("averageVolume")) or coerce_float(info.get("averageDailyVolume10Day")),
                
                # Valuation
                "pe": pe,
                "forward_pe": coerce_float(info.get("forwardPE")),
                "peg": peg,
                "price_to_book": coerce_float(info.get("priceToBook")),
                "ps_ratio": coerce_float(info.get("priceToSalesTrailing12Months")),
                "ev": coerce_float(info.get("enterpriseValue")),
                "ev_to_ebitda": coerce_float(info.get("enterpriseToEbitda")),
                "ev_to_revenue": coerce_float(info.get("enterpriseToRevenue")),

                # Earnings
                "eps": trailing_eps,
                "forward_eps": coerce_float(info.get("forwardEps")),
                "earnings_growth": coerce_float(info.get("earningsGrowth")),
                "revenue_growth": coerce_float(info.get("revenueGrowth")),
                "target_mean_price": coerce_float(info.get("targetMeanPrice")),
                "target_high_price": coerce_float(info.get("targetHighPrice")),

                # Historical CAGR
                "revenue_cagr_5y": self._calculate_cagr_5y(ticker, "Total Revenue"),
                "net_income_cagr_5y": self._calculate_cagr_5y(ticker, "Net Income"),

                # Market
                "market_cap": coerce_float(info.get("marketCap")),
                "beta": coerce_float(info.get("beta")),

                # Profitability
                "roe": coerce_float(info.get("returnOnEquity")),
                "roa": coerce_float(info.get("returnOnAssets")),
                "gross_margin": coerce_float(info.get("grossMargins")),
                "operating_margin": coerce_float(info.get("operatingMargins")),
                "net_margin": coerce_float(info.get("profitMargins")),

                # Financial health — D/E stored as ratio (Yahoo sends percent)
                "debt_to_equity": yahoo_debt_to_equity_to_ratio(info.get("debtToEquity")),
                "current_ratio": coerce_float(info.get("currentRatio")),
                "quick_ratio": coerce_float(info.get("quickRatio")),
                "free_cashflow": coerce_float(info.get("freeCashflow")),
                "total_cash": coerce_float(info.get("totalCash")),
                "total_debt": coerce_float(info.get("totalDebt")),

                # Dividends
                "dividend_yield": coerce_float(info.get("dividendYield")),
                "payout_ratio": coerce_float(info.get("payoutRatio")),

                # Short interest
                "short_ratio": coerce_float(info.get("shortRatio")),
                "short_pct_float": coerce_float(info.get("shortPercentOfFloat")),
                
                # Added fundamental metrics
                "roic": coerce_float(info.get("returnOnCapitalEmployed")) or self._calculate_roic(ticker),
                
                # Screener / Heatmap additions
                "operating_cashflow": coerce_float(info.get("operatingCashflow")),
                "ebitda": coerce_float(info.get("ebitda")),
                "sma_200": coerce_float(info.get("twoHundredDayAverage")),
                "sector": info.get("sector") or None,
                "industry": info.get("industry") or None,
                "performance_1y": coerce_float(info.get("52WeekChange")),
            }
            
            # Calculate Net Debt
            total_debt = res.get("total_debt")
            total_cash = res.get("total_cash")
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

