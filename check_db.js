import { initFirebase, getDb } from './src/services/firebase.js';

async function main() {
  initFirebase();
  const db = getDb();
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    const sum = await db.collection('users').doc(doc.id).collection('configuration').doc('ibkr_summary').get();
    if (sum.exists) {
      console.log(`User ${doc.id} configuration/ibkr_summary =`, sum.data());
    } else {
      console.log(`User ${doc.id} HAS NO configuration/ibkr_summary`);
    }

    const oldSum = await db.collection('users').doc(doc.id).collection('config').doc('ibkr_summary').get();
    if (oldSum.exists) {
      console.log(`User ${doc.id} config/ibkr_summary =`, oldSum.data());
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
