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

async function inspect() {
  console.log("--- Root Collections ---");
  const collections = await db.listCollections();
  for (const c of collections) {
    console.log(`- ${c.id}`);
  }

  console.log("\n--- Users ---");
  const users = await db.collection('users').limit(1).get();
  for (const u of users.docs) {
    console.log(`User: ${u.id}`);
    const userCollections = await u.ref.listCollections();
    for (const uc of userCollections) {
      console.log(`  - Subcollection: ${uc.id}`);
      const sample = await uc.limit(1).get();
      if (!sample.empty) {
        console.log(`    Sample doc (${sample.docs[0].id}):`, JSON.stringify(sample.docs[0].data()).substring(0, 100));
      }
    }
  }

  console.log("\n--- Currencies ---");
  const cur = await db.collection('currencies').get();
  console.log(`Total currencies: ${cur.size}`);
  
  process.exit(0);
}

inspect().catch(console.error);
