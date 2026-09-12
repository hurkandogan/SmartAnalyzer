from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Index
from sqlalchemy.schema import UniqueConstraint
from .db import Base

class Candle(Base):
    __tablename__ = "candles"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    
    # Pre-calculated MAs
    sma_20 = Column(Float, nullable=True)
    sma_50 = Column(Float, nullable=True)
    sma_200 = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint('symbol', 'date', name='uq_candle_symbol_date'),
    )

class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    symbol = Column(String(20), primary_key=True, index=True)
    sector = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    updated_at = Column(DateTime, nullable=True)

class Technical(Base):
    __tablename__ = "technicals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    
    rsi = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    avg_volume = Column(Float, nullable=True)
    rvol = Column(Float, nullable=True)
    iv = Column(Float, nullable=True)
    ema_10 = Column(Float, nullable=True)
    ema_20 = Column(Float, nullable=True)
    sma_50 = Column(Float, nullable=True)
    sma_200 = Column(Float, nullable=True)
    score = Column(Integer, nullable=True)
    performance_1y = Column(Float, nullable=True)
    rs = Column(Float, nullable=True)
    
    __table_args__ = (
        UniqueConstraint('symbol', 'date', name='uq_technical_symbol_date'),
    )

class Fundamental(Base):
    __tablename__ = "fundamentals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    
    # Valuation
    pe = Column(Float, nullable=True)
    peg = Column(Float, nullable=True)
    
    # Profitability / Efficiency
    roic = Column(Float, nullable=True)
    roe = Column(Float, nullable=True)
    
    # Growth
    revenue_growth_yoy = Column(Float, nullable=True)

    # Screener & Heatmap additions
    market_cap = Column(Float, nullable=True)
    free_cashflow = Column(Float, nullable=True)
    operating_cashflow = Column(Float, nullable=True)
    net_debt = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=True)
    net_debt_to_ebitda = Column(Float, nullable=True)
    eps = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint('symbol', 'date', name='uq_fundamental_symbol_date'),
    )

class ScreenerUniverse(Base):
    __tablename__ = "screener_universe"

    symbol = Column(String(20), primary_key=True, index=True)
    source_index = Column(String(50), nullable=True) # e.g. SP500, Custom
    added_at = Column(DateTime, nullable=True)
    is_active = Column(Integer, default=1) # 1=Active, 0=Dropped

    # IBKR contract details cache
    con_id = Column(Integer, nullable=True)
    long_name = Column(String(200), nullable=True)
    exchange = Column(String(50), nullable=True)
    currency = Column(String(10), nullable=True)
    sector = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    subcategory = Column(String(100), nullable=True)

class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    level = Column(String(20), nullable=False, index=True) # INFO, ERROR, SUCCESS
    source = Column(String(50), nullable=False, index=True) # e.g. 'portfolio-sync', 'candle-miner'
    message = Column(String, nullable=False)
    details = Column(String, nullable=True) # JSON or additional text

class GeneratedReportLog(Base):
    __tablename__ = "generated_report_logs"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    generated_at = Column(DateTime, nullable=False, index=True)
    scan_type = Column(String(50), nullable=True) # FUNDAMENTAL, VALUE, SWING

class OptionSignalLog(Base):
    __tablename__ = "option_signal_logs"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    signal_type = Column(String(20), nullable=False)
    generated_at = Column(DateTime, nullable=False, index=True)

class AnalysisScore(Base):
    __tablename__ = "analysis_scores"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    analysis_type = Column(String(50), nullable=False, index=True) # fundamentals, qullamaggie, options_sell, options_buy
    score = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False) # candidate, watch, no_setup
    reason = Column(String, nullable=True) # JSON reasoning
    price = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, index=True)

