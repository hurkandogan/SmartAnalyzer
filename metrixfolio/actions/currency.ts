'use server';

import { adminDb } from '@/utils/firebase-admin';

export interface ExchangeRate {
  id: string;
  from: string;
  to: string;
  rate: number;
  date: string;
}

export async function getExchangeRatesAction(): Promise<ExchangeRate[]> {
  try {
    const snapshot = await adminDb.collection('currencies').get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        from: data.from,
        to: data.to,
        rate: Number(data.rate),
        date: data.date,
      };
    });
  } catch (error) {
    console.error('Rates fetch error:', error);
    return [];
  }
}
