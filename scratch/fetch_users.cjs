const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    console.log(`User: ${doc.id}`);
    const config = await db.collection('users').doc(doc.id).collection('config').doc('main').get();
    if (config.exists) {
      console.log(`  Config:`, config.data());
    }
  }
}

main().catch(console.error);
