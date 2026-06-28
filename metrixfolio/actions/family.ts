'use server';

import { adminDb } from '@/utils/firebase-admin';
import { FamilyMember, FamilyTransaction } from '@/types/family';
import { getExchangeRatesAction } from '@/actions/currency';
import { CurrencyConverter } from '@/utils/currency-math';

export async function getFamilyMembersAction(userId: string): Promise<FamilyMember[]> {
  try {
    const snapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .orderBy('created_at', 'asc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FamilyMember[];
  } catch (error: any) {
    console.error('Error fetching family members:', error);
    return [];
  }
}

export async function addFamilyMemberAction(
  userId: string,
  name: string,
) {
  try {
    const docRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc();

    const data = {
      name,
      created_at: new Date().toISOString(),
    };

    await docRef.set(data);
    return { success: true, id: docRef.id };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function deleteFamilyMemberAction(userId: string, memberId: string) {
  try {
    const memberRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId);

    // Get all transactions
    const txSnapshot = await memberRef.collection('transactions').get();

    // Delete all transactions in a batch
    const batch = adminDb.batch();
    txSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the member
    batch.delete(memberRef);

    await batch.commit();

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function getMemberTransactionsAction(
  userId: string,
  memberId: string,
): Promise<FamilyTransaction[]> {
  try {
    const [snapshot, rates] = await Promise.all([
      adminDb
        .collection('users')
        .doc(userId)
        .collection('family_members')
        .doc(memberId)
        .collection('transactions')
        .orderBy('date', 'desc')
        .get(),
      getExchangeRatesAction(),
    ]);

    const converter = new CurrencyConverter(rates);
    const convertToUsd = (amount: number, fromCurrency: string) =>
      converter.convert(amount, fromCurrency, 'USD');

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const originalCurrency = data.currency || 'USD';
      return {
        id: doc.id,
        ...data,
        original_price: data.price,
        original_currency: originalCurrency,
        price: convertToUsd(data.price, originalCurrency),
        currency: 'USD',
      };
    }) as FamilyTransaction[];
  } catch (error: any) {
    console.error('Error fetching family transactions:', error);
    return [];
  }
}

export async function addMemberTransactionAction(
  userId: string,
  memberId: string,
  payload: Omit<FamilyTransaction, 'id' | 'created_at'>,
) {
  try {
    const docRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId)
      .collection('transactions')
      .doc();

    const data = {
      ...payload,
      symbol: payload.symbol.toUpperCase(),
      created_at: new Date().toISOString(),
    };

    await docRef.set(data);
    return { success: true, id: docRef.id };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function deleteMemberTransactionAction(
  userId: string,
  memberId: string,
  transactionId: string,
) {
  try {
    await adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId)
      .collection('transactions')
      .doc(transactionId)
      .delete();

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
