'use server';

import { adminDb } from '@/utils/firebase-admin';

export async function getAnalysisCandidatesAction() {
  try {
    const snapshot = await adminDb.collection('assets').get();
    const assets: any[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.analysis) {
        assets.push({
          symbol: doc.id,
          ...data
        });
      }
    });
    
    return assets;
  } catch (err) {
    console.error("Failed to fetch analysis candidates:", err);
    return [];
  }
}
