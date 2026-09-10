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

async function moveCategoryTargets() {
  const users = await db.collection('users').get();
  for (const user of users.docs) {
    const catTargetsRef = user.ref.collection('configuration').doc('category_targets');
    const catDoc = await catTargetsRef.get();
    
    if (catDoc.exists) {
      console.log(`Moving category_targets for user ${user.id}`);
      const data = catDoc.data();
      
      // Move to settings/preferences under a 'category_targets' field
      await user.ref.collection('settings').doc('preferences').set({ category_targets: data }, { merge: true });
      
      // Delete the old doc
      await catTargetsRef.delete();
    }
  }
}

moveCategoryTargets().then(() => process.exit(0)).catch(console.error);
