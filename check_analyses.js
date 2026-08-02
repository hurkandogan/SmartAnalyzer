import { getDb, initFirebase } from './src/services/firebase.js';

(async () => {
  initFirebase();
  const db = getDb();
  const snap = await db.collection('watchlist').doc('RKLB').collection('analyses').get();
  console.log(`Found ${snap.size} analyses for RKLB`);
  if (!snap.empty) {
    const latest = snap.docs[snap.size - 1].data();
    console.log("Latest date:", latest.date, "Market Cap:", latest.market_cap);
  }
  process.exit(0);
})();
