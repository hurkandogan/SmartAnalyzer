'use server';

import { adminDb } from '@/utils/firebase-admin';

export async function getOpportunitiesAction(minScore: number = 75) {
  try {
    const doc = await adminDb.collection('screener').doc('opportunities').get();
    if (!doc.exists) return [];
    
    const data = doc.data();
    const ops = data?.items || [];
    
    // Filter out anything below minScore just in case
    return ops.filter((o: any) => o.score >= minScore);
  } catch (err) {
    console.error("Failed to fetch opportunities from Firebase:", err);
    return [];
  }
}

export async function getHeatmapAction() {
  try {
    const doc = await adminDb.collection('screener').doc('heatmap').get();
    if (!doc.exists) return {};
    
    return doc.data()?.tree || {};
  } catch (err) {
    console.error("Failed to fetch heatmap from Firebase:", err);
    return {};
  }
}

