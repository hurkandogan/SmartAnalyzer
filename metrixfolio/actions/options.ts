'use server';

import { adminDb } from '@/utils/firebase-admin';
import { OptionPosition } from '@/types/options';

const getCollectionRef = (userId: string) =>
  adminDb.collection('users').doc(userId).collection('options');

export async function addOptionAction(
  userId: string,
  data: Omit<OptionPosition, 'id' | 'created_at'>,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const docRef = getCollectionRef(userId).doc();
    const newOption: OptionPosition = {
      ...data,
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

    return snapshot.docs.map((doc) => doc.data() as OptionPosition);
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
    await getCollectionRef(userId).doc(optionId).update(data);
    return { success: true, message: 'Option updated' };
  } catch (error: any) {
    console.error('Update Option Error:', error);
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
    const doc = await adminDb
      .collection('users')
      .doc(userId)
      .collection('config')
      .doc('ibkr_summary')
      .get();
    
    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      netLiquidation: data.netLiquidation ?? 0,
      buyingPower: data.buyingPower ?? 0,
      excessLiquidity: data.excessLiquidity ?? 0,
      updated_at: data.updated_at ? (data.updated_at.toDate ? data.updated_at.toDate().toISOString() : String(data.updated_at)) : null,
    };
  } catch (error) {
    console.error('getIBKRSummaryAction error:', error);
    return null;
  }
}
