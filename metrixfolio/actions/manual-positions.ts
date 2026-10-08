'use server';

import { adminDb } from '@/utils/firebase-admin';
import { getExchangeRatesAction } from '@/actions/currency';

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

    // Get exchange rate if non-USD
    let rate = 1.0;
    const rawCurrency = data.currency || 'USD';
    if (rawCurrency !== 'USD') {
      const rates = await getExchangeRatesAction();
      const match = rates.find((r) => r.from === rawCurrency && r.to === 'USD');
      if (match && match.rate > 0) {
        rate = match.rate;
      }
    }

    const rawAvgCost = data.avg_cost;
    const avgCostUsd = rawAvgCost * rate;
    const costBasisUsd = data.amount * avgCostUsd;
    const symUpper = data.symbol.toUpperCase();

    let type = 'ASSET';
    if (data.category_id === 'crypto' || ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'].includes(symUpper)) {
      type = 'CRYPTO';
    } else if (data.category_id === 'cash') {
      type = 'CASH';
    }

    await docRef.set({
      id: assetId,
      symbol: symUpper,
      name: data.name,
      amount: data.amount.toString(),
      avg_cost: avgCostUsd.toString(),
      cost_basis_money: costBasisUsd.toString(),
      currency: 'USD',
      original_currency: rawCurrency,
      original_avg_cost: rawAvgCost.toString(),
      current_price: avgCostUsd.toString(),
      unrealized_pnl: '0',
      source: 'MANUAL',
      type: type,
      category_id: data.category_id || 'uncategorized',
      updated_at: Math.floor(Date.now() / 1000),
    });

    return { success: true, message: 'Manual asset added.' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
