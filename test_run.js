import { runDailyStockAnalysis } from './src/jobs/dailyStockAnalysis.js';

(async () => {
  console.log("Running Daily Analysis (force=true)...");
  await runDailyStockAnalysis(true, true);
  console.log("Done.");
  process.exit(0);
})();
