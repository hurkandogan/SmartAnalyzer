import { initFirebase, getDb } from './src/services/firebase.js';
(async () => {
  initFirebase();
  const db = getDb();
  const snapshot = await db.collection('users').limit(1).get();
  snapshot.forEach(doc => console.log(doc.id, JSON.stringify(doc.data(), null, 2)));
  process.exit(0);
})();
