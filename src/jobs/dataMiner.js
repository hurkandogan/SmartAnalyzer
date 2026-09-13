import { pythonClient } from '../services/pythonClient.js';
import { dbLogger } from '../utils/logger.js';

/**
 * Runs the daily data mining process for all tickers in the screener universe.
 * Fetches daily candles and fundamentals sequentially with a 15s delay.
 */
export async function runDataMiner() {
  const source = 'candle-miner';
  
  try {
    await dbLogger(source, 'info', 'Starting daily candle and fundamentals miner.');
    
    // 1. Get the entire screener universe from Postgres via Python Service
    const universe = await pythonClient.getScreenerUniverse();
    const symbols = universe.filter(u => u.is_active).map(u => u.symbol);
    
    if (!symbols || symbols.length === 0) {
      await dbLogger(source, 'info', 'Universe is empty. Nothing to mine.');
      return;
    }
    
    await dbLogger(source, 'info', `Found ${symbols.length} active symbols to mine. Starting process...`);
 
    // 2. Process each symbol sequentially to avoid hitting rate limits
    let successCount = 0;
    let errorCount = 0;
 
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      
      try {
        await dbLogger(source, 'info', `Mining ticker [${i + 1}/${symbols.length}]: ${symbol}`);
        
        // Call Python service to handle IBKR/Yahoo scraping and DB insertion (No Firestore logic here)
        const result = await pythonClient.mineTicker(symbol);
        
        if (result && result.status === 'success') {
          successCount++;
          await dbLogger(source, 'info', `✓ Mined and saved to local DB for ${symbol}`);
        } else {
          errorCount++;
          await dbLogger(source, 'error', `Failed to mine ${symbol}`, result?.messages || 'Unknown error');
        }
      } catch (err) {
        errorCount++;
        await dbLogger(source, 'error', `Exception while mining ${symbol}: ${err.message}`);
      }

      // 3. Wait for 5 seconds before processing the next ticker, unless it's the last one
      if (i < symbols.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    await dbLogger(source, 'success', `Miner completed. Success: ${successCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    await dbLogger(source, 'error', `Fatal error in data miner: ${error.message}`);
  }
}
