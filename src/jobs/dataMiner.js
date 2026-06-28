import { getWatchlist } from '../services/firebase.js';
import { pythonClient } from '../services/pythonClient.js';
import { dbLogger } from '../utils/logger.js';

/**
 * Runs the daily data mining process for all tickers in the watchlist.
 * Fetches daily candles and fundamentals sequentially with a 15s delay.
 */
export async function runDataMiner() {
  const source = 'candle-miner';
  
  try {
    await dbLogger(source, 'info', 'Starting daily candle and fundamentals miner.');
    
    // 1. Get the entire watchlist from Firebase
    const watchlistDict = await getWatchlist();
    const symbols = Object.values(watchlistDict).map((item) => item.symbol);
    
    if (!symbols || symbols.length === 0) {
      await dbLogger(source, 'info', 'Watchlist is empty. Nothing to mine.');
      return;
    }
    
    await dbLogger(source, 'info', `Found ${symbols.length} symbols to mine. Starting process...`);
 
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

      // 3. Wait for 15 seconds before processing the next ticker, unless it's the last one
      if (i < symbols.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }

    await dbLogger(source, 'success', `Miner completed. Success: ${successCount}, Errors: ${errorCount}`);
    
    // 4. Schedule Stock Analysis to run 10 minutes later
    await dbLogger(source, 'info', 'Scheduling Stock Analysis to run in 10 minutes...');
    setTimeout(() => {
      import('./dailyStockAnalysis.js').then(module => {
        module.runDailyStockAnalysis().catch(err => console.error("Chained Stock Analysis failed:", err));
      });
    }, 10 * 60 * 1000); // 10 minutes
    
  } catch (error) {
    await dbLogger(source, 'error', `Fatal error in data miner: ${error.message}`);
  }
}
