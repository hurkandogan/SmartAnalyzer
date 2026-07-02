import yfinance as yf
import logging

logger = logging.getLogger("smart_analyser.macro")

MACRO_TICKERS = {
    "SPX": "^GSPC",
    "NDX": "^NDX",
    "DXY": "DX-Y.NYB",
    "EURUSD": "EURUSD=X",
    "TLT": "TLT",
    "TNX": "^TNX",
    "HYG": "HYG",
    "VIX": "^VIX",
    "VIX9D": "^VIX9D",
    "VIX3M": "^VIX3M"
}

class MacroService:
    @staticmethod
    def get_market_weather_data() -> dict:
        """
        Fetches macro indicators from Yahoo Finance for the market weather report.
        Returns a dict mapping readable names to their last price and daily change percentage.
        """
        results = {}
        symbols = list(MACRO_TICKERS.values())
        
        try:
            # period='5d' to ensure we get a previous close for pct change calculation
            data = yf.download(symbols, period="5d", group_by="ticker", threads=True, progress=False)
            
            for name, ticker in MACRO_TICKERS.items():
                try:
                    if len(symbols) == 1:
                        ticker_data = data
                    else:
                        ticker_data = data[ticker]
                        
                    # Drop NaNs
                    ticker_data = ticker_data.dropna(subset=['Close'])
                    
                    if len(ticker_data) >= 2:
                        last_close = float(ticker_data['Close'].iloc[-1])
                        prev_close = float(ticker_data['Close'].iloc[-2])
                        pct_change = ((last_close - prev_close) / prev_close) * 100
                        
                        results[name] = {
                            "price": last_close,
                            "change_pct": pct_change
                        }
                    elif len(ticker_data) == 1:
                        last_close = float(ticker_data['Close'].iloc[-1])
                        results[name] = {
                            "price": last_close,
                            "change_pct": 0.0
                        }
                    else:
                        results[name] = None
                        
                except Exception as e:
                    logger.error(f"Error extracting macro data for {name} ({ticker}): {e}")
                    results[name] = None
                    
        except Exception as e:
            logger.error(f"Error downloading macro data: {e}")
            
        return results
