import { pythonClient } from '../services/pythonClient.js';
import { getWatchlist, saveIvCrushOpportunities } from '../services/firebase.js';
import { logger, dbLogger } from '../utils/logger.js';

/**
 * Checks if the US stock market has been open for at least 30 minutes.
 * Market opens at 09:30 EST. We want to run this after 10:00 EST.
 */
function isReadyForScan() {
  const now = new Date();
  const estStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const estDate = new Date(estStr);
  
  const day = estDate.getDay();
  const hour = estDate.getHours();
  const minutes = estDate.getMinutes();
  
  if (day === 0 || day === 6) {
    return false;
  }
  
  const timeInMinutes = hour * 60 + minutes;
  const targetMinutes = 10 * 60; // 10:00 AM EST (30 mins after open)
  
  return timeInMinutes >= targetMinutes;
}

export async function runIvCrushJob(force = false) {
  if (!force && !isReadyForScan()) {
    logger.info('[IVCrushJob] Too early or market closed. Skipping IV Crush scan.');
    return { success: true, skipped: true };
  }

  logger.info('── IV Crush Scanner Job started ──');
  try {
    const watchlist = await getWatchlist();
    if (!watchlist || watchlist.length === 0) {
      logger.info('[IVCrushJob] Watchlist is empty. Nothing to scan.');
      return { success: true, signalCount: 0 };
    }

    const symbols = watchlist.map(item => item.symbol || item.id);
    logger.info(`[IVCrushJob] Scanning IV Crush opportunities for: ${symbols.length} symbols...`);
    
    const result = await pythonClient.scanIvCrush(symbols, true);
    
    if (result && result.status === 'success') {
      const signals = result.signals || [];
      logger.info(`[IVCrushJob] ✓ IV Crush scan completed. Found ${signals.length} opportunities.`);
      
      // Save to Firestore
      await saveIvCrushOpportunities(signals);
      
      return { success: true, signalCount: signals.length, signals };
    } else {
      logger.warn('[IVCrushJob] ✗ IV Crush scan returned failure status.');
      return { success: false, message: 'API returned failure status' };
    }
  } catch (err) {
    logger.error(`[IVCrushJob] ✗ Failed to run IV Crush job: ${err.message}`);
    return { success: false, error: err.message };
  }
}
