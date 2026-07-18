import { runPortfolioSync } from '../src/jobs/portfolioSync.js';
import { initFirebase } from '../src/services/firebase.js';

async function main() {
  initFirebase();
  console.log('Running portfolio sync...');
  await runPortfolioSync();
  console.log('Done!');
  process.exit(0);
}

main();
