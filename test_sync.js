import { runPortfolioSync } from './src/jobs/portfolioSync.js';
import { initFirebase } from './src/services/firebase.js';

async function main() {
  try {
    initFirebase();
    await runPortfolioSync();
    console.log("Done");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
