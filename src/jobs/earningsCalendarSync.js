import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

export async function runEarningsCalendarSync() {
  logger.info('[Earnings] Starting earnings calendar sync via Python...');
  const pythonDir = path.resolve(__dirname, '../../python');
  
  try {
    const { stdout, stderr } = await execAsync('uv run python jobs/earnings_job.py', {
      cwd: pythonDir
    });
    
    if (stdout) logger.info(`[Earnings] ${stdout.trim()}`);
    if (stderr) logger.warn(`[Earnings] ${stderr.trim()}`);
    
    return { success: true };
  } catch (err) {
    logger.error(`[Earnings] Failed to sync earnings calendar: ${err.message}`);
    throw err;
  }
}
