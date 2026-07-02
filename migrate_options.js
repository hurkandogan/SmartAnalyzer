import('./src/services/firebase.js').then(fb => {
  fb.initFirebase();
  const db = fb.getDb();
  
  console.log('── Running Options Database Migration ──');
  
  db.collection('users').listDocuments().then(async userRefs => {
    let migratedCount = 0;
    for (const uRef of userRefs) {
      const snap = await uRef.collection('options').get();
      console.log(`User ${uRef.id}: Found ${snap.size} options.`);
      
      const batch = db.batch();
      let hasUpdates = false;
      
      snap.forEach(doc => {
        const data = doc.data();
        const target = data.target || '';
        
        let parsedStrike = null;
        let parsedExpiry = null;
        
        const match = target.match(/^([\d.,]+)\s*\$?\s*[\/\s-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (match) {
          const strikeStr = match[1].replace(',', '.');
          parsedStrike = parseFloat(strikeStr) || 0;
          
          const day = match[2].padStart(2, '0');
          const month = match[3].padStart(2, '0');
          const year = match[4];
          parsedExpiry = `${year}-${month}-${day}`; // YYYY-MM-DD
        } else {
          const strikeOnly = target.match(/^([\d.,]+)\s*\$?$/);
          if (strikeOnly) {
            const strikeStr = strikeOnly[1].replace(',', '.');
            parsedStrike = parseFloat(strikeStr) || 0;
          }
        }
        
        // Only update if not already set or if we parsed something new
        if (parsedStrike !== null || parsedExpiry !== null) {
          const updates = {};
          if (data.strike_price === undefined || data.strike_price === null) {
            updates.strike_price = parsedStrike;
          }
          if (data.expiry_date === undefined || data.expiry_date === null) {
            updates.expiry_date = parsedExpiry;
          }
          
          if (Object.keys(updates).length > 0) {
            batch.update(doc.ref, updates);
            migratedCount++;
            hasUpdates = true;
          }
        }
      });
      
      if (hasUpdates) {
        await batch.commit();
        console.log(`User ${uRef.id}: Batch commit completed.`);
      }
    }
    
    console.log(`── Migration Completed! Migrated ${migratedCount} documents. ──`);
    process.exit(0);
  }).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
});
