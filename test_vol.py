import pandas as pd
import numpy as np
df = pd.DataFrame({'Volume': np.random.randint(500000, 1500000, size=100)})
current_vol = df['Volume'].iloc[-1]
avg_vol_20d = df['Volume'].iloc[-20:].mean()
print(f"Current: {current_vol}, Avg: {avg_vol_20d}, Ratio: {current_vol/avg_vol_20d}")
