'use server';

import { adminDb } from '@/utils/firebase-admin';
import { Transaction } from '@/types/transaction';
import { FieldValue } from 'firebase-admin/firestore';

const getCollectionRef = (userId: string) =>
  adminDb.collection('users').doc(userId).collection('transactions');

export async function addTransactionAction(
  userId: string,
  data: Omit<Transaction, 'id' | 'created_at'>,
) {
  if (!userId) return { success: false, message: 'User not authenticated' };

  try {
    const docRef = getCollectionRef(userId).doc();

    const newTransaction = {
      ...data,
      id: docRef.id,
      amount: Number(data.amount),
      created_at: Date.now(),
    };

    await docRef.set(newTransaction);

    return { success: true, message: 'Transaction added' };
  } catch (error: any) {
    console.error('Add Transaction Error:', error);
    return { success: false, message: error.message };
  }
}

export async function getTransactionsAction(
  userId: string,
): Promise<Transaction[]> {
  if (!userId) return [];

  try {
    const snapshot = await getCollectionRef(userId)
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as Transaction);
  } catch (error) {
    console.error('Get Transactions Error:', error);
    return [];
  }
}

export async function deleteTransactionAction(
  userId: string,
  transactionId: string,
) {
  try {
    await getCollectionRef(userId).doc(transactionId).delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
