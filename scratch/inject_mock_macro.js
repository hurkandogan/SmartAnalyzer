import { getFirestore } from 'firebase-admin/firestore';
import { initFirebase } from '../src/services/firebase.js';

async function main() {
  initFirebase();
  const db = getFirestore();
  const docRef = db.collection('screener').doc('macro_calendar');
  
  const snap = await docRef.get();
  let events = [];
  if (snap.exists) {
    events = snap.data().events || [];
  }

  // Create an event for tomorrow
  const tomorrow = new Date();
  tomorrow.setHours(tomorrow.getHours() + 24);
  
  events.push({
    title: 'TEST EVENT: FOMC Press Conference (Mock)',
    country: 'USD',
    impact: 'High',
    date: tomorrow.toISOString()
  });

  await docRef.set({
    events: events,
    updatedAt: new Date().toISOString()
  });

  console.log('Injected test event for tomorrow into Firebase.');
  process.exit(0);
}

main();
