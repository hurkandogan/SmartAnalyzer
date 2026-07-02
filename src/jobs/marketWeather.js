import { pythonClient } from '../services/pythonClient.js';
import { logger, dbLogger } from '../utils/logger.js';

export async function runMarketWeather() {
  logger.info('── Market Weather Forecast triggered ──');
  try {
    await dbLogger('market-weather', 'info', 'Triggering Market Weather analysis via Python backend...');
    
    // Call the Python API /api/market-weather via pythonClient
    const data = await pythonClient.triggerMarketWeather();
    
    logger.info(`Market weather successfully dispatched: ${data.message}`);
    await dbLogger('market-weather', 'success', 'Market Weather report generated and dispatched successfully.');
  } catch (error) {
    logger.error(`Error in runMarketWeather: ${error.message}`);
    await dbLogger('market-weather', 'error', `Failed to generate Market Weather: ${error.message}`);
  }
}
