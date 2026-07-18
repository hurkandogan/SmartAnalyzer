import { runSwingJob } from '../src/jobs/swingJob.js';
import { runMacroCalendarSync } from '../src/jobs/macroCalendarSync.js';
import { initFirebase } from '../src/services/firebase.js';

async function main() {
  initFirebase();
  console.log("Starting tests...");
  await runMacroCalendarSync();
  await runSwingJob();
  console.log("Tests completed.");
  process.exit(0);
}

main();
