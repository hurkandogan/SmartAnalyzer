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


class Fundamental(Base):
    __tablename__ = "fundamentals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    
    # Valuation
    pe = Column(Float, nullable=True)
    forward_pe = Column(Float, nullable=True)
    peg = Column(Float, nullable=True)
    ev_to_revenue = Column(Float, nullable=True)
    
    # Profitability / Efficiency
    roic = Column(Float, nullable=True)
    roe = Column(Float, nullable=True)
    
    # Technical / Volume
    rsi = Column(Float, nullable=True)
    avg_volume = Column(Float, nullable=True)
    rvol = Column(Float, nullable=True)
    iv = Column(Float, nullable=True)  # Implied Volatility from IBKR
    
    # Financial Health
    cash_burn_rate = Column(Float, nullable=True)
    cash_runway = Column(Float, nullable=True)
    
    # Growth
    revenue_growth_yoy = Column(Float, nullable=True)
    
    # Sentiment / Short Interest
    short_interest_pct = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint('symbol', 'date', name='uq_fundamental_symbol_date'),
    )

class Watchlist(Base):
    __tablename__ = "watchlist"

    symbol = Column(String(20), primary_key=True, index=True)
    last_synced_at = Column(DateTime, nullable=True)
    last_split_check_at = Column(DateTime, nullable=True)
    last_hard_update_at = Column(DateTime, nullable=True)

class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    level = Column(String(20), nullable=False, index=True) # INFO, ERROR, SUCCESS
    source = Column(String(50), nullable=False, index=True) # e.g. 'portfolio-sync', 'candle-miner'
    message = Column(String, nullable=False)
    details = Column(String, nullable=True) # JSON or additional text
