import admin from 'firebase-admin';
import fs from 'fs';
const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  const db = admin.firestore();
  const snap = await db.collection('watchlist').get();
  snap.forEach(doc => {
    console.log(doc.id, doc.data().name, doc.data().industry);
  });
  process.exit(0);
}
run();
