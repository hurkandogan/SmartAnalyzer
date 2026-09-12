import cron from 'node-cron';
import { runCurrencyUpdate } from './currencyUpdate.js';
import { runPortfolioSync } from './portfolioSync.js';
import { runDataMiner } from './dataMiner.js';
import { runMarketWeather } from './marketWeather.js';
import { runMacroCalendarSync } from './macroCalendarSync.js';
import { runEarningsCalendarSync } from './earningsCalendarSync.js';
import { runAnalysisBot } from './analysisBot.js';
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
      
      // Fetch latest currencies before portfolio sync
      try {
        await dbLogger('currency-update', 'info', 'Currency Update triggered from Portfolio Sync');
        await runCurrencyUpdate();
      } catch (err) {
        logger.error(`Currency update before portfolio sync failed: ${err.message}`);
      }
      
      await runPortfolioSync();
      await dbLogger('portfolio-sync', 'success', 'Portfolio Sync completed successfully');
    } catch (error) {
      await dbLogger('portfolio-sync', 'error', `Portfolio Sync failed: ${error.message}`);
    }
  });

  // ── Daily Stock Analysis (Qullamaggie etc): daily at 14:00 ──
  cron.schedule('0 14 * * 1-5', async () => {
    logger.info('[CRON] Analysis Bot triggered');
    try {
      await runAnalysisBot();
    } catch (error) {
      logger.error(`[CRON] Analysis Bot failed: ${error.message}`);
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

  // ── Market Weather Forecast: 15:15 Mon-Fri (Pre-market TR/DE) ──
  cron.schedule('15 15 * * 1-5', async () => {
    logger.info('[CRON] Market Weather Forecast triggered');
    try {
      await runMarketWeather();
    } catch (error) {
      await dbLogger('market-weather', 'error', `Market Weather failed: ${error.message}`);
    }
  });



  // ── Macro Calendar Sync: every Monday at 08:00 ──
  cron.schedule('0 8 * * 1', async () => {
    logger.info('[CRON] Macro Calendar Sync triggered');
    try {
      await runMacroCalendarSync();
    } catch (error) {
      logger.error(`[CRON] Macro Calendar Sync failed: ${error.message}`);
    }
  });

  // ── Earnings Calendar Sync: daily at 07:00 ──
  cron.schedule('0 7 * * *', async () => {
    logger.info('[CRON] Earnings Calendar Sync triggered');
    try {
      await runEarningsCalendarSync();
    } catch (error) {
      logger.error(`[CRON] Earnings Calendar Sync failed: ${error.message}`);
    }
  });

  logger.info('Scheduler started — 7 jobs registered');
}

export { runPortfolioSync, runCurrencyUpdate, runDataMiner, runMarketWeather, runMacroCalendarSync, runEarningsCalendarSync, runAnalysisBot };
