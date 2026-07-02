import yfinance as yf

tickers = ['^VIX9D', '^VIX3M', 'HYG', 'TLT']
data = yf.download(tickers, period='1d')
print(data['Close'])
