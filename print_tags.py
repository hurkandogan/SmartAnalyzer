import asyncio
from ib_insync import IB
async def main():
    ib = IB()
    await ib.connectAsync("127.0.0.1", 7497, 100)
    vals = ib.accountValues()
    for v in vals:
        if "Liq" in v.tag or "Excess" in v.tag or "Buy" in v.tag or "Margin" in v.tag:
            print(f"{v.tag}: {v.value} {v.currency}")
    ib.disconnect()
asyncio.run(main())
