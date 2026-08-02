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

export async function getMacroCalendarAction() {
  try {
    const doc = await adminDb.collection('screener').doc('macro_calendar').get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (err) {
    console.error("Failed to fetch macro calendar:", err);
    return null;
  }
}

export async function getEarningsCalendarAction() {
  try {
    const doc = await adminDb.collection('screener').doc('earnings_calendar').get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (err) {
    console.error("Failed to fetch earnings calendar:", err);
    return null;
  }
}

export async function getSwingSignalsAction() {
  try {
    const doc = await adminDb.collection('screener').doc('swing_signals').get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (err) {
    console.error("Failed to fetch swing signals:", err);
    return null;
    return null;
  }
}

export async function getValueOpportunitiesAction() {
  try {
    const res = await fetch('http://127.0.0.1:8000/api/screener/value', { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch value opportunities from Python:", err);
    return [];
  }
}
