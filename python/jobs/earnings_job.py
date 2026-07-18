import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import logging
import httpx
import yfinance as yf
from datetime import datetime, timedelta
from database.db import SessionLocal
from database.models import ScreenerUniverse, Watchlist

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("earnings_job")

async def fetch_earnings():
    db = SessionLocal()
    try:
        # Get all unique symbols from Universe and Watchlist
        universe = [u.symbol for u in db.query(ScreenerUniverse).filter(ScreenerUniverse.is_active == 1).all()]
        watchlist = [w.symbol for w in db.query(Watchlist).all()]
        symbols = list(set(universe + watchlist))
        
        if not symbols:
            logger.info("No symbols found to fetch earnings.")
            return

        logger.info(f"Checking upcoming earnings for {len(symbols)} symbols...")
        
        now = datetime.now().date()
        two_weeks_later = now + timedelta(days=14)
        
        events = []
        
        # We can't easily thread yf.Ticker().calendar for many symbols without risking rate limits or errors,
        # but doing it sequentially or batched is fine for a nightly cron.
        
        for sym in symbols:
            try:
                ticker = yf.Ticker(sym)
                cal = ticker.calendar
                if cal and 'Earnings Date' in cal and cal['Earnings Date']:
                    # yfinance returns a list of dates
                    next_dates = cal['Earnings Date']
                    for d in next_dates:
                        # yfinance dates are datetime.date objects
                        if isinstance(d, datetime):
                            d_date = d.date()
                        else:
                            d_date = d
                            
                        if now <= d_date <= two_weeks_later:
                            # Found an upcoming earnings!
                            events.append({
                                "title": f"Bilanço: {sym}",
                                "country": "US",
                                "impact": "High",
                                "date": datetime(d_date.year, d_date.month, d_date.day, 16, 0).isoformat() + "Z", # Approximating 16:00 UTC (Post-market)
                                "type": "earnings",
                                "is_watchlist": sym in watchlist
                            })
                            break # Only need the closest one
            except Exception as e:
                # Some symbols might not have earnings data or yfinance errors out
                logger.debug(f"Could not fetch earnings for {sym}: {e}")
                
        logger.info(f"Found {len(events)} upcoming earnings in the next 14 days.")
        
        if events:
            # Push to Firebase via Hono
            hono_url = "http://localhost:3500/api/screener/push-firebase"
            async with httpx.AsyncClient() as client:
                res = await client.post(hono_url, json={"type": "earnings_calendar", "data": events})
                res.raise_for_status()
            logger.info("Successfully pushed earnings calendar to Firebase.")
            
    except Exception as e:
        logger.error(f"Error fetching earnings: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(fetch_earnings())
