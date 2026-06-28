import { runDataMiner } from './src/jobs/dataMiner.js';
import { dbLogger } from './src/utils/logger.js';

async function test() {
  await dbLogger('test-script', 'info', 'Testing manual logger');
  console.log("Logger tested.");
}

test().then(() => process.exit(0)).catch(console.error);
