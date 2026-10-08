'use server';

import { adminDb } from '@/utils/firebase-admin';
import { FamilyMember, FamilyTransaction, FamilyDeposit } from '@/types/family';
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

    // Get all transactions & deposits
    const [txSnapshot, depSnapshot] = await Promise.all([
      memberRef.collection('transactions').get(),
      memberRef.collection('deposits').get(),
    ]);

    // Delete all transactions and deposits in a batch
    const batch = adminDb.batch();
    txSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    depSnapshot.docs.forEach((doc) => {
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

export async function updateMemberTransactionAction(
  userId: string,
  memberId: string,
  transactionId: string,
  payload: Partial<Omit<FamilyTransaction, 'id' | 'created_at'>>
) {
  try {
    const docRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId)
      .collection('transactions')
      .doc(transactionId);

    const updateData: any = { ...payload };
    if (payload.symbol) {
      updateData.symbol = payload.symbol.toUpperCase();
    }
    
    // Only update if payload is not empty
    if (Object.keys(updateData).length > 0) {
      await docRef.update(updateData);
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function getFamilyDepositsAction(
  userId: string,
  memberId: string,
): Promise<FamilyDeposit[]> {
  try {
    const snapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId)
      .collection('deposits')
      .orderBy('date', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        amount: Number(data.amount) || 0,
        currency: data.currency || 'EUR',
        date: data.date || '',
        note: data.note || '',
        amount_usd: Number(data.amount_usd) || 0,
        amount_eur: Number(data.amount_eur) || 0,
        amount_try: Number(data.amount_try) || 0,
        rates_snapshot: data.rates_snapshot || {},
        created_at: data.created_at || '',
      };
    }) as FamilyDeposit[];
  } catch (error: any) {
    console.error('Error fetching family deposits:', error);
    return [];
  }
}

export async function addFamilyDepositAction(
  userId: string,
  memberId: string,
  payload: {
    amount: number;
    currency: string;
    date: string;
    note?: string;
  },
) {
  try {
    const rates = await getExchangeRatesAction();
    const converter = new CurrencyConverter(rates);

    const amount = Number(payload.amount);
    const curr = (payload.currency || 'EUR').toUpperCase();

    // Calculate conversions for USD, EUR, and TRY
    const amount_usd = Number(converter.convert(amount, curr, 'USD').toFixed(2));
    const amount_eur = Number(converter.convert(amount, curr, 'EUR').toFixed(2));
    const amount_try = Number(converter.convert(amount, curr, 'TRY').toFixed(2));

    const rates_snapshot: Record<string, number> = {};
    rates.forEach((r) => {
      rates_snapshot[`${r.from}_${r.to}`] = r.rate;
    });

    const docRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId)
      .collection('deposits')
      .doc();

    const data = {
      amount,
      currency: curr,
      date: payload.date || new Date().toISOString().split('T')[0],
      note: payload.note || 'Kindergeld',
      amount_usd,
      amount_eur,
      amount_try,
      rates_snapshot,
      created_at: new Date().toISOString(),
    };

    await docRef.set(data);
    return { success: true, id: docRef.id };
  } catch (error: any) {
    console.error('Error adding family deposit:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteFamilyDepositAction(
  userId: string,
  memberId: string,
  depositId: string,
) {
  try {
    await adminDb
      .collection('users')
      .doc(userId)
      .collection('family_members')
      .doc(memberId)
      .collection('deposits')
      .doc(depositId)
      .delete();

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting family deposit:', error);
    return { success: false, message: error.message };
  }
}

