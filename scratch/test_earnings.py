import yfinance as yf

ticker = yf.Ticker("AAPL")
print("Calendar:")
print(ticker.calendar)

print("\nEarnings Dates:")
try:
    print(ticker.earnings_dates)
except Exception as e:
    print("Error:", e)
