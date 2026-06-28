'use server';

import { adminDb } from '@/utils/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const CONFIG_PATH = (userId: string) =>
  adminDb
    .collection('users')
    .doc(userId)
    .collection('configuration')
    .doc('main');

export interface GrowthWidgetData {
  growthRate: number;
  baseAmount?: number;
  milestones: { step: number; date: string; value: number }[];
}

// 1. Ayarları Kaydetme
export async function saveGrowthSettingsAction(
  userId: string,
  data: Omit<GrowthWidgetData, 'milestones'>,
) {
  if (!userId) return { success: false, message: 'Auth required' };

  try {
    await CONFIG_PATH(userId).set(
      {
        widgets: {
          growth_goals: {
            growthRate: data.growthRate,
            baseAmount: data.baseAmount ?? 1000,
          },
        },
      },
      { merge: true },
    );

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

// 2. Milestone Kontrolü (Sayfa yüklendiğinde çalışacak)
export async function checkMilestonesAction(
  userId: string,
  currentPortfolioValue: number,
) {
  if (!userId) return;

  const ref = CONFIG_PATH(userId);
  const doc = await ref.get();

  let growth: GrowthWidgetData;

  if (!doc.exists) {
    // If no config exists, create a default one to allow milestone tracking
    const defaultConfig = {
      widgets: {
        growth_goals: {
          growthRate: 10,
          baseAmount: 1000,
          milestones: [],
        },
      },
    };
    await ref.set(defaultConfig, { merge: true });
    growth = { growthRate: 10, baseAmount: 1000, milestones: [] };
  } else {
    const widgets = doc.data()?.widgets || {};
    growth = widgets.growth_goals as GrowthWidgetData;

    if (!growth) {
      growth = { growthRate: 10, baseAmount: 1000, milestones: [] };
      await ref.update({ 'widgets.growth_goals': growth });
    }
  }

  const baseVal = growth.baseAmount ?? 1000;

  // Cannot compute compound growth from 0
  if (baseVal <= 0) return { success: false };

  let loopVal = baseVal;
  let step = 1;
  const rate = (growth.growthRate || 10) / 100;
  const newMilestones = [...(growth.milestones || [])];
  let updated = false;

  while (true) {
    const nextVal = loopVal + loopVal * rate;

    if (currentPortfolioValue >= nextVal) {
      const exists = newMilestones.find((m) => m.step === step);
      if (!exists) {
        newMilestones.push({
          step,
          value: nextVal,
          date: new Date().toISOString().split('T')[0],
        });
        updated = true;
      }
    } else {
      break;
    }

    loopVal = nextVal;
    step++;

    if (step > 1000) break;
  }

  if (updated) {
    // Sadece milestones alanını güncelle
    await ref.update({
      'widgets.growth_goals.milestones': newMilestones,
    });
    return { success: true, newMilestones };
  }

  return { success: false };
}

export async function getGrowthWidgetAction(
  userId: string,
): Promise<GrowthWidgetData | null> {
  const doc = await CONFIG_PATH(userId).get();
  return doc.data()?.widgets?.growth_goals || null;
}

export async function saveGoalAmountAction(userId: string, goalAmount: number) {
  if (!userId) return { success: false, message: 'Auth required' };

  try {
    await CONFIG_PATH(userId).set({ goal_amount: goalAmount }, { merge: true });
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function getGoalAmountAction(
  userId: string,
): Promise<number | null> {
  if (!userId) return null;

  const doc = await CONFIG_PATH(userId).get();
  return doc.data()?.goal_amount ?? null;
}
