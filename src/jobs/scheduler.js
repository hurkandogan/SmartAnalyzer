import cron from 'node-cron';
import { runCurrencyUpdate } from './currencyUpdate.js';
import { runDailyStockAnalysis } from './dailyStockAnalysis.js';
import { runPortfolioSync } from './portfolioSync.js';
import { runDataMiner } from './dataMiner.js';
import { runMarketWeather } from './marketWeather.js';
import { runOptionsSignalsJob } from './optionsSignalsJob.js';
import { runSwingJob } from './swingJob.js';
import { runMacroCalendarSync } from './macroCalendarSync.js';
import { runIvCrushJob } from './ivCrushJob.js';
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

  // ── Daily Stock Analysis ──
  // Note: This is no longer scheduled via cron.
  // It is chained automatically after the Data Miner finishes.

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

  // ── Options Technical Signals: hourly Mon-Fri ──
  cron.schedule('0 * * * 1-5', async () => {
    logger.info('[CRON] Options Technical Signals triggered');
    try {
      await dbLogger('options-signals', 'info', 'Options Signals Scan triggered');
      const res = await runOptionsSignalsJob();
      if (res.success) {
        if (res.skipped) {
          await dbLogger('options-signals', 'info', 'Options Signals Scan skipped (market closed)');
        } else {
          await dbLogger('options-signals', 'success', `Options Signals Scan completed: ${res.signalCount} signals found`);
        }
      } else {
        await dbLogger('options-signals', 'error', `Options Signals Scan failed: ${res.message || res.error}`);
      }
    } catch (error) {
      await dbLogger('options-signals', 'error', `Options Signals Scan error: ${error.message}`);
    }
  });

  // ── IV Crush Scanner: daily at 16:30 (around 09:30 EST) ──
  // Note: runIvCrushJob itself checks if 30 mins have passed since US market open.
  cron.schedule('30 16 * * 1-5', async () => {
    logger.info('[CRON] IV Crush Scanner triggered');
    try {
      await dbLogger('iv-crush', 'info', 'IV Crush Scanner triggered');
      await runIvCrushJob();
      await dbLogger('iv-crush', 'success', 'IV Crush Scanner completed');
    } catch (error) {
      await dbLogger('iv-crush', 'error', `IV Crush Scanner failed: ${error.message}`);
    }
  });

  // ── Swing Scanner: daily at 22:30 (Market Close) ──
  cron.schedule('30 22 * * 1-5', async () => {
    logger.info('[CRON] Swing Scanner triggered');
    try {
      await dbLogger('swing-scanner', 'info', 'Swing Scanner triggered');
      await runSwingJob();
      await dbLogger('swing-scanner', 'success', 'Swing Scanner completed');
    } catch (error) {
      await dbLogger('swing-scanner', 'error', `Swing Scanner failed: ${error.message}`);
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

  logger.info('Scheduler started — 9 jobs registered');
}

export { runPortfolioSync, runDailyStockAnalysis, runCurrencyUpdate, runDataMiner, runMarketWeather, runOptionsSignalsJob, runIvCrushJob, runSwingJob, runMacroCalendarSync };
