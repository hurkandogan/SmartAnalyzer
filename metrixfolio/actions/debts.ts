'use server';

import { adminDb } from '@/utils/firebase-admin';
import { Debt } from '@/types/debt';

const getCollectionRef = (userId: string) =>
  adminDb.collection('users').doc(userId).collection('debts');

export async function addDebtAction(
  userId: string,
  data: Omit<Debt, 'id' | 'created_at'>,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const docRef = getCollectionRef(userId).doc();

    const newDebt: Debt = {
      ...data,
      id: docRef.id,
      amount: Number(data.amount),
      created_at: Date.now(),
    };

    await docRef.set(newDebt);

    return { success: true, message: 'Debt added' };
  } catch (error: any) {
    console.error('Add Debt Error:', error);
    return { success: false, message: error.message };
  }
}

export async function getDebtsAction(userId: string): Promise<Debt[]> {
  if (!userId) return [];

  try {
    const snapshot = await getCollectionRef(userId)
      .orderBy('created_at', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as Debt);
  } catch (error) {
    console.error('Get Debts Error:', error);
    return [];
  }
}

export async function updateDebtAction(
  userId: string,
  debtId: string,
  data: Partial<Omit<Debt, 'id' | 'created_at'>>,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const dataToUpdate = { ...data };
    if (dataToUpdate.amount !== undefined) {
      dataToUpdate.amount = Number(dataToUpdate.amount);
    }
    await getCollectionRef(userId).doc(debtId).update(dataToUpdate);
    return { success: true, message: 'Debt updated' };
  } catch (error: any) {
    console.error('Update Debt Error:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteDebtAction(userId: string, debtId: string) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    await getCollectionRef(userId).doc(debtId).delete();
    return { success: true, message: 'Debt deleted' };
  } catch (error: any) {
    console.error('Delete Debt Error:', error);
    return { success: false, message: error.message };
  }
}
