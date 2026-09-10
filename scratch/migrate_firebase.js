import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';

const serviceAccount = JSON.parse(
  readFileSync('/home/hurkan/Desktop/projects/SmartAnalyser/serviceAccountKey.json', 'utf-8'),
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrate() {
  console.log("Starting Firebase Migration...");

  // 1. Backup all data (lite backup for safety)
  console.log("Backing up configuration and currencies...");
  const backup = { users: {}, currencies: {} };
  
  // 2. Currencies cleanup
  console.log("Cleaning up currencies...");
  const curSnap = await db.collection('currencies').get();
  const keptCurrencies = ['USD', 'EUR', 'TRY'];
  for (const doc of curSnap.docs) {
    backup.currencies[doc.id] = doc.data();
    if (!keptCurrencies.includes(doc.id)) {
      await doc.ref.delete();
      console.log(`  Deleted currency: ${doc.id}`);
    } else {
      console.log(`  Kept currency: ${doc.id}`);
    }
  }

  // 3. Watchlist cleanup
  console.log("Cleaning up watchlist...");
  const wlSnap = await db.collection('watchlist').get();
  for (const doc of wlSnap.docs) {
    await doc.ref.delete();
  }
  console.log(`  Deleted ${wlSnap.size} watchlist items.`);

  // 4. Users migration
  const users = await db.collection('users').get();
  for (const user of users.docs) {
    console.log(`Migrating User: ${user.id}`);
    backup.users[user.id] = {};

    // 4a. Move configuration/main to settings/preferences
    const mainConfigRef = user.ref.collection('configuration').doc('main');
    const mainConfig = await mainConfigRef.get();
    
    if (mainConfig.exists) {
      console.log(`  Moving configuration/main to settings/preferences`);
      const data = mainConfig.data();
      backup.users[user.id].mainConfig = data;
      
      // Delete old categories from the config data since we use fixed ones now
      if (data.categories) {
        delete data.categories;
      }
      
      await user.ref.collection('settings').doc('preferences').set(data, { merge: true });
      await mainConfigRef.delete();
    }

    // 4b. Delete categories subcollection
    const categoriesRef = await user.ref.collection('categories').get();
    if (!categoriesRef.empty) {
      console.log(`  Deleting ${categoriesRef.size} categories for user ${user.id}`);
      for (const catDoc of categoriesRef.docs) {
        await catDoc.ref.delete();
      }
    }
  }

  writeFileSync('./scratch/firebase_backup.json', JSON.stringify(backup, null, 2));
  console.log("Migration completed! Backup saved to scratch/firebase_backup.json");
}

migrate().then(() => process.exit(0)).catch(console.error);
