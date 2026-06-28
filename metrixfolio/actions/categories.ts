'use server';

import { adminDb } from '@/utils/firebase-admin';
import { CollectionType, Category } from '@/types/settings';

export async function getCategoriesAction(userId: string): Promise<Category[]> {
  if (!userId) return [];

  try {
    const snapshot = await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('categories')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Category[];
  } catch (error) {
    console.error('Get Categories Error:', error);
    return [];
  }
}

export async function addCategoryAction(
  userId: string,
  name: string,
  target: number,
  type: string,
  color: string,
) {
  if (!userId || !name) {
    return { success: false, message: 'Missing parameters.' };
  }

  const id = name.trim().toLowerCase().replace(/\s+/g, '');

  if (!id) {
    return { success: false, message: 'Invalid category name.' };
  }

  try {
    const categoryRef = adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('categories')
      .doc(id);

    const doc = await categoryRef.get();
    if (doc.exists) {
      return {
        success: false,
        message: 'A category with this name (ID) already exists.',
      };
    }

    await categoryRef.set({
      name: name.trim(),
      target_percentage: target,
      type,
      color,
      updated_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Add Category Error:', error);
    return { success: false, message: error.message };
  }
}

export async function updateCategoryAction(
  userId: string,
  category: Partial<Category> & { color?: string },
) {
  if (!userId || !category.id) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('categories')
      .doc(category.id)
      .update({
        ...category,
        updated_at: new Date().toISOString(),
      });

    return { success: true };
  } catch (error: any) {
    console.error('Update Category Error:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteCategoryAction(userId: string, category: Category) {
  if (!userId || !category.id) {
    return { success: false, message: 'Missing parameters.' };
  }

  try {
    await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection('categories')
      .doc(category.id)
      .delete();

    return { success: true };
  } catch (error: any) {
    console.error('Delete Category Error:', error);
    return { success: false, message: error.message };
  }
}