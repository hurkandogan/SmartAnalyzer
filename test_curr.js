import { initFirebase, getDb } from './src/services/firebase.js';
(async () => {
  initFirebase();
  const db = getDb();
  const snapshot = await db.collection('currencies').get();
  snapshot.forEach(doc => console.log(doc.id, doc.data()));
  process.exit(0);
})();
