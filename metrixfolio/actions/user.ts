'use server';

import { adminDb } from '@/utils/firebase-admin';

export async function getUserPreferenceAction(uid: string, key: string): Promise<any> {
  if (!uid || !key) return null;
  try {
    const docRef = adminDb.collection('users').doc(uid);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      return data?.[key] ?? null;
    }
    return null;
  } catch (error) {
    console.error(`Error getting user preference ${key}:`, error);
    return null;
  }
}

export async function getUserProfileInfoAction(uid: string): Promise<any> {
  if (!uid) return null;
  try {
    const docRef = adminDb.collection('users').doc(uid);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (!data) return null;
      
      // Serialize Timestamps
      const plainData = { ...data };
      if (plainData.updated_at && typeof plainData.updated_at.toMillis === 'function') {
        plainData.updated_at = plainData.updated_at.toMillis();
      }
      if (plainData.created_at && typeof plainData.created_at.toMillis === 'function') {
        plainData.created_at = plainData.created_at.toMillis();
      }
      
      return plainData;
    }
    return null;
  } catch (error) {
    console.error(`Error getting user profile info:`, error);
    return null;
  }
}

export async function saveUserPreferenceAction(uid: string, key: string, value: any): Promise<boolean> {
  if (!uid || !key) return false;
  try {
    const docRef = adminDb.collection('users').doc(uid);
    await docRef.set({ [key]: value }, { merge: true });
    return true;
  } catch (error) {
    console.error(`Error saving user preference ${key}:`, error);
    return false;
  }
}
