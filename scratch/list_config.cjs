const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
async function main() {
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    console.log(`User: ${doc.id}`);
    const collections = await doc.ref.listCollections();
    for (const c of collections) {
      console.log(`  Collection: ${c.id}`);
      const subdocs = await c.get();
      for (const d of subdocs.docs) {
        console.log(`    Doc: ${d.id}`);
        console.log(`    Data:`, d.data());
      }
    }
  }
}
main().then(() => process.exit(0)).catch(console.error);
