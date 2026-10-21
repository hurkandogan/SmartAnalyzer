import { pythonClient } from '../services/pythonClient.js';
import { setMarketBarData } from '../services/firebase.js';
import { logger } from '../utils/logger.js';
import { fetchExchangeRates } from './portfolio/currencyHelper.js';
import { priceCache } from './portfolio/portfolioCalculator.js';
import { syncGatewayUser } from './portfolio/syncGatewayUser.js';
import { syncAllOtherUsers } from './portfolio/syncFlexUser.js';

export async function runPortfolioSync() {
  logger.info('── Portfolio Sync started (Unified Multi-Currency Engine) ──');
  priceCache.clear();

  const rates = await fetchExchangeRates();
  logger.info(`[PortfolioSync] Exchange rates (to USD): EUR=${rates.EUR}, TRY=${rates.TRY}`);

  try {
    await syncGatewayUser(rates);
  } catch (err) {
    logger.error(`[PortfolioSync] Gateway user sync failed: ${err.message}`);
  }

  try {
    await syncAllOtherUsers(rates);
  } catch (err) {
    logger.error(`[PortfolioSync] Other users (Flex/Manual) sync failed: ${err.message}`);
  }

  try {
    const marketBarData = await pythonClient.getMarketBar();
    if (marketBarData) {
      await setMarketBarData(marketBarData);
      logger.info('── Market Bar updated ──');
    }
  } catch (err) {
    logger.error(`[PortfolioSync] Market Bar update failed: ${err.message}`);
  }

  logger.info('── Portfolio Sync done ──');
  return { success: true };
}
