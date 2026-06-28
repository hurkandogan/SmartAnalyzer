import asyncio
from ib_insync import *

async def test():
    ib = IB()
    try:
        await ib.connectAsync('127.0.0.1', 4001, clientId=999)
        
        contract = Contract(secType='CMDTY', symbol='XAG', currency='USD', exchange='SMART')
        qual = await ib.qualifyContractsAsync(contract)
        print("XAG Qualified:", qual)
        
        contract2 = Contract(secType='CASH', symbol='XAG', currency='USD', exchange='IDEALPRO')
        qual2 = await ib.qualifyContractsAsync(contract2)
        print("XAG CASH IDEALPRO Qualified:", qual2)
        
    except Exception as e:
        print("Error:", e)
    finally:
        ib.disconnect()

asyncio.run(test())
