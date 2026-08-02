import { initFirebase, getDb } from './src/services/firebase.js';
(async () => {
  initFirebase();
  const db = getDb();
  const doc = await db.collection('screener').doc('earnings_calendar').get();
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
})();
