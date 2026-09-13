import os
import sys
from dotenv import load_dotenv
import pandas as pd
from datetime import datetime

# sys.path config
sys.path.append(os.path.join(os.path.dirname(__file__), 'python'))
from data.yahoo import get_yahoo_data

load_dotenv()

def test_epam():
    symbol = "EPAM"
    df = get_yahoo_data(symbol, period="1y")
    spy_df = get_yahoo_data("SPY", period="1y")
    
    current_price = df['Close'].iloc[-1]
    current_sma50 = df['Close'].rolling(window=50).mean().iloc[-1]
    
    print(f"Symbol: {symbol}")
    print(f"Current Price: {current_price:.2f}")
    print(f"SMA50: {current_sma50:.2f}")
    
    if current_price >= current_sma50:
        print("Above SMA50: TRUE")
    else:
        print("Above SMA50: FALSE")

if __name__ == "__main__":
    test_epam()
