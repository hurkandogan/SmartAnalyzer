'use server';

import { adminDb } from '@/utils/firebase-admin';

function serializeFirestoreData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (typeof obj.toMillis === 'function') {
    return new Date(obj.toMillis()).toISOString();
  }
  if (typeof obj === 'object' && '_seconds' in obj && '_nanoseconds' in obj) {
    return new Date(obj._seconds * 1000 + obj._nanoseconds / 1000000).toISOString();
  }
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeFirestoreData);
  }
  if (typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      res[key] = serializeFirestoreData(obj[key]);
    }
    return res;
  }
  return obj;
}

export async function getAnalysisCandidatesAction() {
  try {
    const snapshot = await adminDb.collection('assets').get();
    const assets: any[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.analysis) {
        assets.push(
          serializeFirestoreData({
            symbol: doc.id,
            ...data,
          })
        );
      }
    });
    
    return assets;
  } catch (err) {
    console.error("Failed to fetch analysis candidates:", err);
    return [];
  }
}
