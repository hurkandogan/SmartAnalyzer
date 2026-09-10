-- Populate company_profiles from screener_universe and fundamentals
INSERT INTO company_profiles (symbol, sector, industry, updated_at)
SELECT DISTINCT s.symbol, s.sector, s.industry, NOW()
FROM screener_universe s
ON CONFLICT (symbol) DO NOTHING;

-- Also try to get from fundamentals if missing
INSERT INTO company_profiles (symbol, sector, industry, updated_at)
SELECT DISTINCT f.symbol, f.sector, f.industry, NOW()
FROM fundamentals f
WHERE f.sector IS NOT NULL
ON CONFLICT (symbol) DO UPDATE SET 
  sector = EXCLUDED.sector, 
  industry = EXCLUDED.industry 
WHERE company_profiles.sector IS NULL;

-- Populate technicals
INSERT INTO technicals (symbol, date, rsi, avg_volume, rvol, iv, sma_200, score, performance_1y)
SELECT symbol, date, rsi, avg_volume, rvol, iv, sma_200, score, performance_1y
FROM fundamentals
ON CONFLICT (symbol, date) DO NOTHING;
