import { initFirebase } from '../src/services/firebase.js';
import { runMacroCalendarSync } from '../src/jobs/macroCalendarSync.js';

async function main() {
  initFirebase();
  await runMacroCalendarSync();
  process.exit(0);
}

main();
