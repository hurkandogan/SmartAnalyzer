import { initFirebase } from './src/services/firebase.js';
import { runAnalysisBot } from './src/jobs/analysisBot.js';

async function main() {
  initFirebase();
  console.log("Firebase initialized");
  await runAnalysisBot();
  console.log("Done");
  process.exit(0);
}

main().catch(console.error);
