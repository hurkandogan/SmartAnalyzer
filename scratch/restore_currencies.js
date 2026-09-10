import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const serviceAccount = JSON.parse(
  readFileSync('/home/hurkan/Desktop/projects/SmartAnalyser/serviceAccountKey.json', 'utf-8'),
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function restoreCurrencies() {
  const backup = JSON.parse(readFileSync('./scratch/firebase_backup.json', 'utf-8'));
  const pairsToRestore = ['EUR_USD', 'USD_EUR', 'USD_TRY', 'TRY_USD'];
  
  for (const pair of pairsToRestore) {
    if (backup.currencies[pair]) {
      await db.collection('currencies').doc(pair).set(backup.currencies[pair]);
      console.log(`Restored ${pair}`);
    }
  }
}

restoreCurrencies().then(() => process.exit(0)).catch(console.error);
