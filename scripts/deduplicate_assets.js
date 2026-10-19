/**
 * Script to clean up duplicate assets (e.g. legacy FLEX_ vs IBKR_ prefix)
 * for a specific user in Firestore.
 *
 * Usage:
 *   node scripts/deduplicate_assets.js [USER_ID]
 */

import { initFirebase, getDb } from '../src/services/firebase.js';

async function main() {
  initFirebase();
  const db = getDb();
  
  // Default to Göker if no user ID passed
  const targetUserId = process.argv[2] || '244PuHZOcWhq6E699kJAUCsK6uI3';
  console.log(`Starting asset deduplication for user: ${targetUserId}`);

  const userDoc = await db.collection('users').doc(targetUserId).get();
  if (!userDoc.exists) {
    console.error(`User ${targetUserId} not found!`);
    process.exit(1);
  }
  console.log(`User Name: ${userDoc.data()?.name || ''} ${userDoc.data()?.lastname || ''} (${userDoc.data()?.email || ''})`);

  const assetsRef = db.collection('users').doc(targetUserId).collection('assets');
  const snap = await assetsRef.get();
  const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total assets found before cleanup: ${allDocs.length}`);

  const flexDocs = allDocs.filter(d => d.id.startsWith('FLEX_'));
  const ibkrDocs = allDocs.filter(d => d.id.startsWith('IBKR_'));

  console.log(`  - FLEX_ count: ${flexDocs.length}`);
  console.log(`  - IBKR_ count: ${ibkrDocs.length}`);

  for (const f of flexDocs) {
    if (f.id === 'FLEX_CASH_USD') {
      console.log(`Deleting duplicate legacy cash: ${f.id}`);
      await assetsRef.doc(f.id).delete();
      continue;
    }

    const symbolSuffix = f.id.replace('FLEX_', '');
    const ibkrCounterpartId = `IBKR_${symbolSuffix}`;
    const ibkrMatch = ibkrDocs.find(i => i.id === ibkrCounterpartId);

    if (ibkrMatch) {
      // If legacy FLEX had a customized category, preserve it
      if (f.category_id && f.category_id !== 'uncategorized' && f.category_id !== ibkrMatch.category_id) {
        console.log(`Preserving category from ${f.id} to ${ibkrCounterpartId}: ${f.category_id}`);
        await assetsRef.doc(ibkrCounterpartId).update({ category_id: f.category_id });
      }
      console.log(`Deleting duplicate FLEX asset: ${f.id}`);
      await assetsRef.doc(f.id).delete();
    } else {
      console.log(`Migrating single FLEX asset to IBKR: ${f.id} -> ${ibkrCounterpartId}`);
      const data = { ...f, id: ibkrCounterpartId, source: 'IBKR' };
      await assetsRef.doc(ibkrCounterpartId).set(data);
      await assetsRef.doc(f.id).delete();
    }
  }

  // Also clean up redundant IBKR_EUR if unified IBKR_USD exists
  const eurCash = await assetsRef.doc('IBKR_EUR').get();
  const usdCash = await assetsRef.doc('IBKR_USD').get();
  if (eurCash.exists && usdCash.exists) {
    console.log('Cleaning up redundant IBKR_EUR cash doc (already unified into IBKR_USD)');
    await assetsRef.doc('IBKR_EUR').delete();
  }

  const finalSnap = await assetsRef.get();
  console.log(`\nCleanup finished. Remaining clean assets: ${finalSnap.size}`);
  finalSnap.docs.forEach(d => {
    console.log(`  - [${d.id}] (${d.data().source}) Cat: ${d.data().category_id} | Qty: ${d.data().amount} | Price: ${d.data().current_price}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('Deduplication failed:', err);
  process.exit(1);
});
