'use server';

import { adminDb } from '@/utils/firebase-admin';
import { CollectionType, Category, FIXED_CATEGORIES } from '@/types/settings';

export async function getCategoriesAction(userId: string): Promise<Category[]> {
  if (!userId) return [];

  try {
    const configDoc = await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('configuration')
      .doc('category_targets')
      .get();

    const customTargets = configDoc.exists ? configDoc.data() : {};

    // Map over FIXED_CATEGORIES to apply custom targets
    return FIXED_CATEGORIES.map((cat) => {
      if (customTargets && typeof customTargets[cat.id] === 'number') {
        return { ...cat, target_percentage: customTargets[cat.id] };
      }
      return cat;
    });
  } catch (error) {
    console.error('Get Categories Error:', error);
    return FIXED_CATEGORIES;
  }
}

export async function updateCategoryTargetAction(
  userId: string,
  categoryId: string,
  targetPercentage: number,
) {
  if (!userId || !categoryId) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    const targetRef = adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('configuration')
      .doc('category_targets');
      
    await targetRef.set({
      [categoryId]: targetPercentage,
      updated_at: new Date().toISOString()
    }, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error('Update Category Target Error:', error);
    return { success: false, message: error.message };
  }
}