'use server';

import { adminDb } from '@/utils/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function getOpportunitiesAction(minScore: number = 75) {
  try {
    revalidatePath('/screener/opportunities');
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

export async function getPricesAction() {
  try {
    const doc = await adminDb.collection('screener').doc('prices').get();
    if (!doc.exists) return {};
    return doc.data()?.prices || {};
  } catch (err) {
    console.error("Failed to fetch prices from Firebase:", err);
    return {};
  }
}

