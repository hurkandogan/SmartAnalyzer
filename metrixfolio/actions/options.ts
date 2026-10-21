'use server';

import { adminDb } from '@/utils/firebase-admin';
import { OptionPosition } from '@/types/options';

const getCollectionRef = (userId: string) =>
  adminDb.collection('users').doc(userId).collection('options');

const cleanOptionSymbol = (s?: string) => (s ? s.trim().split(/\s+/)[0].toUpperCase() : '');

export async function addOptionAction(
  userId: string,
  data: Omit<OptionPosition, 'id' | 'created_at'>,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const docRef = getCollectionRef(userId).doc();
    const newOption: OptionPosition = {
      ...data,
      symbol: cleanOptionSymbol(data.symbol),
      id: docRef.id,
      created_at: Date.now(),
    };

    await docRef.set(newOption);
    return { success: true, message: 'Option added' };
  } catch (error: any) {
    console.error('Add Option Error:', error);
    return { success: false, message: error.message };
  }
}

export async function getOptionsAction(userId: string): Promise<OptionPosition[]> {
  if (!userId) return [];

  try {
    const snapshot = await getCollectionRef(userId)
      .orderBy('buy_date', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as OptionPosition;
      return {
        ...data,
        symbol: cleanOptionSymbol(data.symbol),
      };
    });
  } catch (error) {
    console.error('Get Options Error:', error);
    return [];
  }
}

export async function updateOptionAction(
  userId: string,
  optionId: string,
  data: Partial<Omit<OptionPosition, 'id' | 'created_at'>>,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const patch: any = { ...data };
    if (patch.symbol) {
      patch.symbol = cleanOptionSymbol(patch.symbol);
    }
    await getCollectionRef(userId).doc(optionId).update(patch);
    return { success: true, message: 'Option updated' };
  } catch (error: any) {
    console.error('Update Option Error:', error);
    return { success: false, message: error.message };
  }
}

export async function groupOptionsStrategyAction(
  userId: string,
  optionIds: string[],
  strategyName: string,
) {
  if (!userId || !optionIds || optionIds.length < 2) {
    return { success: false, message: 'Select at least 2 option legs to group.' };
  }

  try {
    const groupId = `STRAT_${Date.now()}`;
    const batch = adminDb.batch();
    const colRef = getCollectionRef(userId);

    for (const id of optionIds) {
      batch.update(colRef.doc(id), {
        group_id: groupId,
        strategy_name: strategyName || 'Custom Spread',
      });
    }

    await batch.commit();
    return { success: true, groupId };
  } catch (error: any) {
    console.error('Group Options Strategy Error:', error);
    return { success: false, message: error.message };
  }
}

export async function ungroupOptionsStrategyAction(
  userId: string,
  groupId: string,
) {
  if (!userId || !groupId) {
    return { success: false, message: 'Missing group ID.' };
  }

  try {
    const colRef = getCollectionRef(userId);
    const snap = await colRef.where('group_id', '==', groupId).get();
    const batch = adminDb.batch();

    snap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        group_id: null,
        strategy_name: null,
      });
    });

    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error('Ungroup Options Strategy Error:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteOptionAction(userId: string, optionId: string) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    await getCollectionRef(userId).doc(optionId).delete();
    return { success: true, message: 'Option deleted' };
  } catch (error: any) {
    console.error('Delete Option Error:', error);
    return { success: false, message: error.message };
  }
}

export async function getIBKRSummaryAction(userId: string) {
  if (!userId) return null;
  try {
    let doc = await adminDb
      .collection('users')
      .doc(userId)
      .collection('configuration')
      .doc('ibkr_summary')
      .get();

    if (!doc.exists) {
      doc = await adminDb
        .collection('users')
        .doc(userId)
        .collection('config')
        .doc('ibkr_summary')
        .get();
    }

    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      netLiquidation: data.netLiquidation ?? 0,
      buyingPower: data.buyingPower ?? 0,
      excessLiquidity: data.excessLiquidity ?? 0,
      updated_at: data.updated_at
        ? data.updated_at.toDate
          ? data.updated_at.toDate().toISOString()
          : String(data.updated_at)
        : null,
    };
  } catch (error) {
    console.error('getIBKRSummaryAction error:', error);
    return null;
  }
}
