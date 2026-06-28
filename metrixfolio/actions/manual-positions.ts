'use server';

import { adminDb } from '@/utils/firebase-admin';

interface ManualPositionData {
  symbol: string;
  name: string;
  amount: number;
  avg_cost: number;
  currency: string;
  category_id: string;
}

export async function addManualPositionAction(
  userId: string,
  data: ManualPositionData,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const cleanSymbol = data.symbol.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const assetId = `MANUAL_${cleanSymbol}`;

    const docRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('assets')
      .doc(assetId);

    await docRef.set({
      id: assetId,
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      amount: data.amount.toString(),
      avg_cost: data.avg_cost.toString(),
      cost_basis_money: (data.amount * data.avg_cost).toString(),
      currency: data.currency,
      current_price: data.avg_cost.toString(),
      unrealized_pnl: '0',
      source: 'MANUAL',
      category_id: data.category_id || 'uncategorized',
      updated_at: Math.floor(Date.now() / 1000),
    });

    return { success: true, message: 'Manual asset added.' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
