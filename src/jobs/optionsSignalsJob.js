import { pythonClient } from '../services/pythonClient.js';
import { getWatchlist } from '../services/firebase.js';
import { logger } from '../utils/logger.js';

/**
 * Checks if the US stock market is currently open.
 * US Market Hours: Weekdays, 9:30 AM - 4:00 PM EST.
 * Eastern Time is UTC-5 (or UTC-4 during Daylight Saving).
 * For simplicity, we convert current time to Eastern Time and verify:
 * - Is weekday (Mon-Fri)
 * - Time is between 09:30 and 16:00
 */
function isMarketOpen() {
  const now = new Date();
  
  // Convert to US Eastern Time string: e.g. "2026-07-05 13:00:00"
  const estStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const estDate = new Date(estStr);
  
  const day = estDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hour = estDate.getHours();
  const minutes = estDate.getMinutes();
  
  // Market is closed on Saturday (6) and Sunday (0)
  if (day === 0 || day === 6) {
    return false;
  }
  
  const timeInMinutes = hour * 60 + minutes;
  const marketOpenMinutes = 9 * 60 + 30;  // 09:30
  const marketCloseMinutes = 16 * 60;     // 16:00
  
  return timeInMinutes >= marketOpenMinutes && timeInMinutes <= marketCloseMinutes;
}

export async function runOptionsSignalsJob(force = false) {
  if (!force && !isMarketOpen()) {
    logger.info('[SignalsJob] US Market is currently closed. Skipping hourly options signals scan.');
    return { success: true, skipped: true };
  }

  logger.info('── Options Technical Signals Scan started ──');
  try {
    const watchlist = await getWatchlist();
    if (!watchlist || watchlist.length === 0) {
      logger.info('[SignalsJob] Watchlist is empty. Nothing to scan.');
      return { success: true, signalCount: 0 };
    }

    const symbols = watchlist.map(item => item.symbol || item.id);
    logger.info(`[SignalsJob] Scanning options signals for: ${symbols.join(', ')}...`);
    
    // Call Python backend with send_telegram = true (which is serialized as send_telegram: true)
    // Wait, pythonClient.getOptionsSignals signature accepts watchlist.
    // Let's modify pythonClient.js to accept sendTelegram flag!
    const result = await pythonClient.getOptionsSignals(symbols, true);
    
    if (result && result.status === 'success') {
      const signals = result.signals || [];
      logger.info(`[SignalsJob] ✓ Option signals scan completed. Found ${signals.length} active signals.`);
      return { success: true, signalCount: signals.length, signals };
    } else {
      logger.warn('[SignalsJob] ✗ Option signals scan returned failure status.');
      return { success: false, message: 'API returned failure status' };
    }
  } catch (err) {
    logger.error(`[SignalsJob] ✗ Failed to run options signals job: ${err.message}`);
    return { success: false, error: err.message };
  }
}
