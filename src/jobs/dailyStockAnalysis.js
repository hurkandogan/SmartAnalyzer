import { pythonClient } from '../services/pythonClient.js';
import {
  getWatchlist,
  updateWatchlistItem,
  addStockAnalysis,
  setStockData,
  getDb
} from '../services/firebase.js';
import { logger } from '../utils/logger.js';

export async function runDailyStockAnalysis() {
  logger.info('── Daily Stock Analysis started via Python service ──');

  let watchlist = [];
  try {
    watchlist = await getWatchlist();
  } catch (err) {
    logger.warn(`Could not fetch watchlist: ${err.message}`);
  }

  if (watchlist.length === 0) {
    logger.info('Watchlist is empty, nothing to analyse.');
    return { success: true, successCount: 0, failCount: 0, total: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  let successCount = 0;
  let failCount = 0;

  // ── Step 1: Iterate over watchlist, delay 20s, call dailySync ──
  for (const item of watchlist) {
    const symbol = item.symbol || item.id;
    if (!symbol) continue;

    try {
      const needsDetails = !item.name || !item.industry || !item.exchange || !item.currency;
      if (needsDetails) {
        logger.info(`[Analysis] ${symbol} missing details — fetching from Python service`);
        const details = await pythonClient.getContractDetails(symbol, 'STK', item.currency || 'USD');
        if (details) {
          const patch = {
            name: details.longName || symbol,
            industry: details.industry || '',
            exchange: details.exchange || '',
            currency: details.currency || 'USD',
            category: details.category || ''
          };
          await updateWatchlistItem(symbol, patch);
        }
      }

      logger.info(`[Analysis] Triggering PostgreSQL sync for ${symbol}...`);
      const syncResult = await pythonClient.dailySync(symbol);
      
      if (syncResult && syncResult.status === 'success') {
        successCount++;
        logger.info(`[Analysis] ✓ ${symbol} sync completed: ${syncResult.messages.join(', ')}`);
      } else {
        failCount++;
        logger.warn(`[Analysis] ✗ ${symbol} sync failed: ${syncResult ? syncResult.messages.join(', ') : 'No response'}`);
      }

    } catch (err) {
      failCount++;
      logger.error(`[Analysis] ✗ Error syncing ${symbol}: ${err.message}`);
    }

    // Wait 20 seconds before the next ticker to avoid IBKR rate limits
    logger.info(`[Analysis] Waiting 20 seconds before next ticker...`);
    await new Promise(resolve => setTimeout(resolve, 20000));
  }

  logger.info(`── Daily Stock Analysis done: ${successCount} ok, ${failCount} failed ──`);
  return { success: true, successCount, failCount, total: watchlist.length };
}
