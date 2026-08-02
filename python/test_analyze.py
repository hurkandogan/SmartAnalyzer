import asyncio
from database.db import SessionLocal
from main import analyze_ticker

async def main():
    db = SessionLocal()
    res = await analyze_ticker("RKLB", db)
    print("Keys:", res["fundamentals"].keys())
    print("Market Cap:", res["fundamentals"].get("market_cap"))
    print("Date:", res["fundamentals"].get("date"))

if __name__ == "__main__":
    asyncio.run(main())
