'use server';

import { adminDb } from '@/utils/firebase-admin';
import { CollectionType } from '@/types/settings';
import { PortfolioHistory } from '@/types/history';

export async function getPortfolioHistoryAction(
  userId: string,
): Promise<PortfolioHistory[]> {
  if (!userId) return [];

  try {
    const snapshot = await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('portfolio_history')
      .orderBy('date', 'asc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();

      let ts = Date.now();
      if (data.timestamp && typeof data.timestamp.toMillis === 'function') {
        ts = data.timestamp.toMillis();
      } else if (data.timestamp) {
        ts = new Date(data.timestamp).getTime();
      }

      return {
        id: doc.id,
        ...data,
        timestamp: ts,
        total_market_value: Number(data.total_market_value) || 0,
        total_cost_basis: Number(data.total_cost_basis) || 0,
      } as PortfolioHistory;
    });
  } catch (error) {
    console.error('Get Portfolio History Error:', error);
    return [];
  }
}