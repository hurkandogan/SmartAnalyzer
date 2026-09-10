'use server';

import { adminDb } from '@/utils/firebase-admin';

export interface MarketBarData {
  indices: {
    SPY: { price: number; change_pct: number };
    QQQ: { price: number; change_pct: number };
    DIA: { price: number; change_pct: number };
  };
  currencies: {
    'USD/EUR': { price: number; change_pct: number };
    'USD/TRY': { price: number; change_pct: number };
  };
}

export async function getMarketBarDataAction(): Promise<MarketBarData | null> {
  try {
    const docRef = adminDb.collection('screener').doc('market_bar');
    const snap = await docRef.get();
    if (snap.exists) {
      return snap.data() as MarketBarData;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch market bar data:', error);
    return null;
  }
}
