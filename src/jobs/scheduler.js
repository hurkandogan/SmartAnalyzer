import cron from 'node-cron';
import { runCurrencyUpdate } from './currencyUpdate.js';
import { runDailyStockAnalysis } from './dailyStockAnalysis.js';
import { runPortfolioSync } from './portfolioSync.js';
import { runDataMiner } from './dataMiner.js';
import { logger, dbLogger } from '../utils/logger.js';

/**
 * Starts all cron schedules.
 * All jobs are also exported as standalone functions for manual triggering via API.
 */
export function startScheduler() {
  // ── Portfolio Sync: every 30 minutes, Mon-Fri ──
  cron.schedule('*/30 * * * 1-5', async () => {
    logger.info('[CRON] Portfolio Sync triggered');
    try {
      await dbLogger('portfolio-sync', 'info', 'Portfolio Sync triggered');
      await runPortfolioSync();
      await dbLogger('portfolio-sync', 'success', 'Portfolio Sync completed successfully');
    } catch (error) {
      await dbLogger('portfolio-sync', 'error', `Portfolio Sync failed: ${error.message}`);
    }
  });

  // ── Daily Stock Analysis: weekdays at 07:00 AM ──
  // Adjust cron expression to your server timezone
  cron.schedule('0 7 * * 1-5', async () => {
    logger.info('[CRON] Daily Stock Analysis triggered');
    try {
      await dbLogger('daily-stock-analysis', 'info', 'Daily Stock Analysis triggered');
      await runDailyStockAnalysis();
      await dbLogger('daily-stock-analysis', 'success', 'Daily Stock Analysis completed successfully');
    } catch (error) {
      await dbLogger('daily-stock-analysis', 'error', `Daily Stock Analysis failed: ${error.message}`);
    }
  });

  // ── Currency Update: daily at 08:00 ──
  cron.schedule('0 8 * * *', async () => {
    logger.info('[CRON] Currency Update triggered');
    try {
      await dbLogger('currency-update', 'info', 'Currency Update triggered');
      await runCurrencyUpdate();
      await dbLogger('currency-update', 'success', 'Currency Update completed successfully');
    } catch (error) {
      await dbLogger('currency-update', 'error', `Currency Update failed: ${error.message}`);
    }
  });

  // ── Candle & Fundamentals Miner: daily at 16:00 ──
  cron.schedule('0 16 * * 1-5', async () => {
    logger.info('[CRON] Candle & Fundamentals Miner triggered');
    try {
      await runDataMiner();
    } catch (error) {
      await dbLogger('candle-miner', 'error', `Miner failed: ${error.message}`);
    }
  });

  logger.info('Scheduler started — 4 jobs registered');
}

export { runPortfolioSync, runDailyStockAnalysis, runCurrencyUpdate, runDataMiner };
