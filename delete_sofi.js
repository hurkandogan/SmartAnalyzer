import { initFirebase, getDb } from './src/services/firebase.js';

(async () => {
  initFirebase();
  const db = getDb();
  await db.collection('iv_crush_opportunities').doc('SOFI').delete();
  console.log("Deleted SOFI from IV Crush Radar!");
  process.exit(0);
})();
