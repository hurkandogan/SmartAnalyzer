import { initFirebase } from './src/services/firebase.js';
import { runIvCrushJob } from './src/jobs/ivCrushJob.js';

(async () => {
  console.log("Initializing Firebase...");
  initFirebase();

  console.log("Running IV Crush Radar (clears out old SOFI entries)...");
  await runIvCrushJob(true); 

  console.log("Done!");
  process.exit(0);
})();
