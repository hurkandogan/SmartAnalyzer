-- Candles
ALTER TABLE candles DROP CONSTRAINT candles_pkey;
ALTER TABLE candles DROP CONSTRAINT uq_candle_symbol_date;
ALTER TABLE candles ADD PRIMARY KEY (symbol, date);
SELECT create_hypertable('candles', 'date', migrate_data => true);

-- Technicals
ALTER TABLE technicals DROP CONSTRAINT technicals_pkey;
ALTER TABLE technicals DROP CONSTRAINT uq_technical_symbol_date;
ALTER TABLE technicals ADD PRIMARY KEY (symbol, date);
SELECT create_hypertable('technicals', 'date', migrate_data => true);

-- Fundamentals
ALTER TABLE fundamentals DROP CONSTRAINT fundamentals_pkey;
ALTER TABLE fundamentals DROP CONSTRAINT uq_fundamental_symbol_date;
ALTER TABLE fundamentals ADD PRIMARY KEY (symbol, date);
SELECT create_hypertable('fundamentals', 'date', migrate_data => true);
