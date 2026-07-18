import { logger } from '../utils/logger.js';
import { pythonClient } from '../services/pythonClient.js';

export async function runSwingJob() {
  logger.info('[Scheduler] Executing Swing Scanner Job...');
  try {
    const result = await pythonClient.scanSwing();
    logger.info(`[SwingJob] Completed. Found ${result.signals ? result.signals.length : 0} signals.`);
  } catch (error) {
    logger.error(`[SwingJob] Error running swing scanner: ${error.message}`);
  }
}
