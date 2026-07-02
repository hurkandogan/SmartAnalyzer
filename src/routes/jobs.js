import { Hono } from 'hono';
import { runPortfolioSync } from '../jobs/portfolioSync.js';
import { runDailyStockAnalysis } from '../jobs/dailyStockAnalysis.js';
import { runCurrencyUpdate } from '../jobs/currencyUpdate.js';
import { runDataMiner } from '../jobs/dataMiner.js';
import { runMarketWeather } from '../jobs/marketWeather.js';
import { logger } from '../utils/logger.js';

export const jobRoutes = new Hono();

// Track running jobs to prevent double-execution
const runningJobs = new Set();

function wrapJob(name, fn) {
  return async (c) => {
    if (runningJobs.has(name)) {
      return c.json(
        { success: false, error: `${name} is already running` },
        409,
      );
    }
    runningJobs.add(name);
    const start = Date.now();
    try {
      const result = await fn();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      logger.info(`[API] ${name} completed in ${duration}s`);
      return c.json({ success: true, duration: `${duration}s`, ...result });
    } catch (error) {
      logger.error(`[API] ${name} failed: ${error.message}`);
      return c.json({ success: false, error: error.message }, 500);
    } finally {
      runningJobs.delete(name);
    }
  };
}

jobRoutes.post('/portfolio-sync', wrapJob('portfolio-sync', runPortfolioSync));
jobRoutes.get('/portfolio-sync', wrapJob('portfolio-sync', runPortfolioSync));

jobRoutes.post(
  '/stock-analysis',
  wrapJob('stock-analysis', runDailyStockAnalysis),
);
jobRoutes.get(
  '/stock-analysis',
  wrapJob('stock-analysis', runDailyStockAnalysis),
);

jobRoutes.post(
  '/currency-update',
  wrapJob('currency-update', runCurrencyUpdate),
);
jobRoutes.get(
  '/currency-update',
  wrapJob('currency-update', runCurrencyUpdate),
);

jobRoutes.post(
  '/data-miner',
  wrapJob('data-miner', runDataMiner),
);
jobRoutes.get(
  '/data-miner',
  wrapJob('data-miner', runDataMiner),
);

// Fallback compatibility path
jobRoutes.post(
  '/candle-miner',
  wrapJob('candle-miner', runDataMiner),
);

jobRoutes.post(
  '/market-weather',
  wrapJob('market-weather', runMarketWeather),
);
jobRoutes.get(
  '/market-weather',
  wrapJob('market-weather', runMarketWeather),
);

jobRoutes.get('/status', (c) => {
  return c.json({
    running: [...runningJobs],
    uptime: process.uptime(),
  });
});
