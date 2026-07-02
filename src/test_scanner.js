import { initFirebase } from './services/firebase.js';
import { runDailyStockAnalysis } from './jobs/dailyStockAnalysis.js';

initFirebase();

console.log("Starting Daily Stock Analysis test run...");
runDailyStockAnalysis(true)
  .then(res => {
    console.log("Analysis and Scan completed successfully:", res);
    process.exit(0);
  })
  .catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  });
