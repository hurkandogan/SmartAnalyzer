import asyncio
from database.db import SessionLocal
from services.sync import SyncService
from services.ibkr import IBKRService
from services.yahoo import YahooService
from services.analytics import AnalyticsService

async def main():
    db = SessionLocal()
    ibkr = IBKRService()
    yahoo = YahooService()
    analytics = AnalyticsService()
    sync = SyncService(ibkr, yahoo, analytics)
    
    print("Testing sync for RKLB...")
    result = await sync.sync_daily_data("RKLB", db)
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
