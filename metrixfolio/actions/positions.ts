'use server';

import { adminDb } from '@/utils/firebase-admin';
import { CollectionType } from '@/types/settings';
import { Asset, ClosedAsset } from '@/types/positions';
import { getExchangeRatesAction } from '@/actions/currency';
import { CurrencyConverter } from '@/utils/currency-math';

interface MarketData {
  symbol: string;
  price: number;
  currency: string;
  last_updated: number;
}

export async function getAssetsAction(userId: string): Promise<Asset[]> {
  if (!userId) return [];

  try {
    const [assetsSnapshot, rates] = await Promise.all([
      adminDb
        .collection(CollectionType.USERS)
        .doc(userId)
        .collection('assets')
        .get(),
      getExchangeRatesAction(),
    ]);

    const assets: Asset[] = assetsSnapshot.docs.map((doc) => {
      const data = doc.data();
      const symbol = data.symbol || '';
      const amount = parseFloat(data.amount) || 0;
      const multiplier = parseFloat(data.multiplier) || 1;
      const currency = data.currency || 'USD';
      const type = data.type || 'STOCK';

      let avgCost = parseFloat(data.avg_cost) || 0;

      // IBKR Opsiyonlarında avg_cost toplam maliyet olarak gelir. UI'da fiyatla yan yana
      // mantıklı görünmesi için (örn: $169 yerine $1.69) çarpana bölüyoruz.
      if (data.source === 'IBKR' && type === 'OPTION' && multiplier > 1) {
        avgCost = avgCost / multiplier;
      }

      const currentPrice = parseFloat(data.current_price) || 0;
      let unrealizedPnl = parseFloat(data.unrealized_pnl) || 0;

      // Manuel varlıkların PnL'si DB'de güncel olmayabilir, anlık hesaplıyoruz.
      if (data.source !== 'IBKR') {
        unrealizedPnl = (currentPrice - avgCost) * amount * multiplier;
      }

      const marketValue = amount * currentPrice * multiplier;

      return {
        id: doc.id,
        symbol: symbol,
        name: data.name || '',
        amount: amount,
        avg_cost: avgCost,
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_pnl: unrealizedPnl,
        currency: 'USD',
        source: data.source || 'MANUAL',
        category_id: data.category_id || 'uncategorized',
        multiplier: multiplier,

        original_currency: currency,
        original_avg_cost: avgCost,
        original_current_price: currentPrice,
      };
    });

    return assets;
  } catch (error) {
    console.error('Error fetching assets:', error);
    return [];
  }
}

export async function updateAssetCategoryAction(
  userId: string,
  assetId: string,
  categoryId: string,
) {
  if (!userId || !assetId || !categoryId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    const assetRef = adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection(CollectionType.ASSETS)
      .doc(assetId);

    await assetRef.update({
      category_id: categoryId,
    });

    return { success: true, message: 'Category updated.' };
  } catch (error: any) {
    console.error('Update Category Error:', error);
    return { success: false, message: error.message };
  }
}

export interface UpdateAssetData {
  symbol?: string;
  name?: string;
  amount?: number;
  avg_cost?: number;
  currency?: string;
  category_id?: string;
}

export async function updateAssetAction(
  userId: string,
  assetId: string,
  data: UpdateAssetData,
) {
  if (!userId || !assetId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    const assetRef = adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection(CollectionType.ASSETS)
      .doc(assetId);

    const updateData: any = {};
    if (data.symbol !== undefined) updateData.symbol = data.symbol.toUpperCase();
    if (data.name !== undefined) updateData.name = data.name;
    
    // Ensure we don't save "NaN" to the database
    if (data.amount !== undefined && !isNaN(data.amount)) {
      updateData.amount = data.amount.toString();
    }
    
    if (data.avg_cost !== undefined && !isNaN(data.avg_cost)) {
      updateData.avg_cost = data.avg_cost.toString();
      // For manual assets, sync cost to price unless updated otherwise
      updateData.current_price = data.avg_cost.toString(); 
      
      if (data.amount !== undefined && !isNaN(data.amount)) {
        updateData.cost_basis_money = (data.amount * data.avg_cost).toString();
      }
    }
    
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.category_id !== undefined) updateData.category_id = data.category_id;

    updateData.updated_at = Math.floor(Date.now() / 1000);

    await assetRef.update(updateData);

    return { success: true, message: 'Asset updated successfully.' };
  } catch (error: any) {
    console.error('Update Asset Error:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteAssetAction(userId: string, assetId: string) {
  if (!userId || !assetId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection(CollectionType.ASSETS)
      .doc(assetId)
      .delete();

    return { success: true, message: 'Asset deleted successfully.' };
  } catch (error: any) {
    console.error('Delete Asset Error:', error);
    return { success: false, message: error.message };
  }
}

export async function purgeZeroQuantityAssetsAction(
  userId: string,
  assetIds: string[],
) {
  if (!userId || assetIds.length === 0) return { success: true, deleted: 0 };

  try {
    const batch = adminDb.batch();
    assetIds.forEach((id) => {
      const ref = adminDb
        .collection(CollectionType.USERS)
        .doc(userId)
        .collection(CollectionType.ASSETS)
        .doc(id);
      batch.delete(ref);
    });
    await batch.commit();
    return { success: true, deleted: assetIds.length };
  } catch (error: any) {
    console.error('Purge Zero Qty Error:', error);
    return { success: false, deleted: 0 };
  }
}

export async function closeAssetAction(
  userId: string,
  assetId: string,
  closePrice: number,
) {
  if (!userId || !assetId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    const userRef = adminDb.collection(CollectionType.USERS).doc(userId);
    const assetRef = userRef.collection(CollectionType.ASSETS).doc(assetId);
    
    const assetDoc = await assetRef.get();
    if (!assetDoc.exists) {
      return { success: false, message: 'Asset not found.' };
    }

    const data = assetDoc.data()!;
    const amount = parseFloat(data.amount) || 0;
    const avgCost = parseFloat(data.avg_cost) || 0;
    const multiplier = parseFloat(data.multiplier) || 1;
    
    const realizedPnl = (closePrice - avgCost) * amount * multiplier;

    const closedPositionRef = userRef.collection('closed_positions').doc(assetId);
    
    await closedPositionRef.set({
      ...data,
      close_price: closePrice.toString(),
      close_date: Math.floor(Date.now() / 1000),
      realized_pnl: realizedPnl.toString(),
      updated_at: Math.floor(Date.now() / 1000),
    });

    await assetRef.delete();

    return { success: true, message: 'Position closed and recorded.' };
  } catch (error: any) {
    console.error('Close Asset Error:', error);
    return { success: false, message: error.message };
  }
}

export async function getClosedAssetsAction(userId: string): Promise<ClosedAsset[]> {
  if (!userId) return [];

  try {
    const [closedSnapshot, rates] = await Promise.all([
      adminDb
        .collection(CollectionType.USERS)
        .doc(userId)
        .collection('closed_positions')
        .orderBy('close_date', 'desc')
        .get(),
      getExchangeRatesAction(),
    ]);

    return closedSnapshot.docs.map((doc) => {
      const data = doc.data();
      const currency = data.currency || 'USD';
      return {
        id: doc.id,
        symbol: data.symbol,
        name: data.name || '',
        amount: parseFloat(data.amount) || 0,
        avg_cost: parseFloat(data.avg_cost) || 0,
        current_price: parseFloat(data.current_price) || 0,
        close_price: parseFloat(data.close_price) || 0,
        realized_pnl: parseFloat(data.realized_pnl) || 0,
        unrealized_pnl: 0, // Not applicable for closed positions but required by type
        close_date: data.close_date,
        currency: 'USD',
        source: data.source || 'MANUAL',
        category_id: data.category_id || 'uncategorized',
        multiplier: parseFloat(data.multiplier) || 1,
      };
    });
  } catch (error) {
    console.error('Error fetching closed assets:', error);
    return [];
  }
}

export async function deleteClosedAssetAction(userId: string, assetId: string) {
  if (!userId || !assetId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('closed_positions')
      .doc(assetId)
      .delete();

    return { success: true, message: 'Historical trade deleted successfully.' };
  } catch (error: any) {
    console.error('Delete Closed Asset Error:', error);
    return { success: false, message: error.message };
  }
}

export async function updateClosedAssetAction(
  userId: string,
  assetId: string,
  data: {
    amount?: number;
    avg_cost?: number;
    close_price?: number;
    currency?: string;
  },
) {
  if (!userId || !assetId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    const assetRef = adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('closed_positions')
      .doc(assetId);

    const doc = await assetRef.get();
    if (!doc.exists) return { success: false, message: 'Trade not found.' };

    const existingData = doc.data()!;
    const updateData: any = {};

    if (data.amount !== undefined) updateData.amount = data.amount.toString();
    if (data.avg_cost !== undefined) updateData.avg_cost = data.avg_cost.toString();
    if (data.close_price !== undefined) updateData.close_price = data.close_price.toString();
    if (data.currency !== undefined) updateData.currency = data.currency;

    // Recalculate realized PnL
    const finalAmount = data.amount ?? parseFloat(existingData.amount);
    const finalAvgCost = data.avg_cost ?? parseFloat(existingData.avg_cost);
    const finalClosePrice = data.close_price ?? parseFloat(existingData.close_price);
    const multiplier = parseFloat(existingData.multiplier) || 1;

    const realizedPnl = (finalClosePrice - finalAvgCost) * finalAmount * multiplier;
    updateData.realized_pnl = realizedPnl.toString();
    updateData.updated_at = Math.floor(Date.now() / 1000);

    await assetRef.update(updateData);

    return { success: true, message: 'Historical trade updated successfully.' };
  } catch (error: any) {
    console.error('Update Closed Asset Error:', error);
    return { success: false, message: error.message };
  }
}

