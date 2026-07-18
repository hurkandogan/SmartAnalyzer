import { getFirestore } from 'firebase-admin/firestore';
import { initFirebase } from '../src/services/firebase.js';

async function main() {
  initFirebase();
  const db = getFirestore();
  
  const macro = await db.collection('screener').doc('macro_calendar').get();
  console.log('Macro Events:', macro.exists ? macro.data().events?.length : 'No doc');
  
  const earn = await db.collection('screener').doc('earnings_calendar').get();
  console.log('Earnings Events:', earn.exists ? earn.data().events?.length : 'No doc');
  
  process.exit(0);
}

main();
