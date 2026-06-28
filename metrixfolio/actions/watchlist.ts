'use server';

import { adminDb } from '@/utils/firebase-admin';
import {
  WatchlistItem,
  WatchlistComment,
  StockAnalysis,
} from '@/types/watchlist';
import { FieldValue } from 'firebase-admin/firestore';

const WATCHLIST_COLLECTION = 'watchlist';

export async function getWatchlistAction(): Promise<WatchlistItem[]> {
  const snapshot = await adminDb.collection(WATCHLIST_COLLECTION).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      symbol: data.symbol || doc.id,
      name: data.name || '',
      exchange: data.exchange || '',
      category: data.category || '',
      industry: data.industry || '',
      currency: data.currency || 'USD',
      added_at: data.added_at?.toDate?.()?.toISOString?.() || '',
    };
  });
}

export async function addWatchlistItemAction(
  userId: string,
  symbol: string,
): Promise<{ success: boolean; message?: string }> {
  if (!userId || !symbol) return { success: false, message: 'Missing data' };

  const upperSymbol = symbol.toUpperCase().trim();
  if (!upperSymbol) return { success: false, message: 'Invalid symbol' };

  const docRef = adminDb.collection(WATCHLIST_COLLECTION).doc(upperSymbol);
  const existing = await docRef.get();

  if (existing.exists) {
    return {
      success: false,
      message: `${upperSymbol} is already in the watchlist`,
    };
  }

  await docRef.set({
    symbol: upperSymbol,
    name: '',
    exchange: '',
    category: '',
    industry: '',
    currency: 'USD',
    added_at: FieldValue.serverTimestamp(),
  });

  return { success: true };
}

export async function removeWatchlistItemAction(
  userId: string,
  symbol: string,
): Promise<{ success: boolean; message?: string }> {
  if (!userId || !symbol) return { success: false, message: 'Missing data' };

  await adminDb.collection(WATCHLIST_COLLECTION).doc(symbol).delete();
  return { success: true };
}

// --- Comments ---

export async function getCommentsAction(
  symbol: string,
): Promise<WatchlistComment[]> {
  if (!symbol) return [];

  const snapshot = await adminDb
    .collection(WATCHLIST_COLLECTION)
    .doc(symbol)
    .collection('comments')
    .orderBy('created_at', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      text: data.text || '',
      author_id: data.author_id || '',
      author_name: data.author_name || '',
      created_at: data.created_at?.toDate?.()?.toISOString?.() || '',
      updated_at: data.updated_at?.toDate?.()?.toISOString?.() || undefined,
    };
  });
}

export async function addCommentAction(
  userId: string,
  symbol: string,
  text: string,
): Promise<{ success: boolean; message?: string }> {
  if (!userId || !symbol || !text.trim()) {
    return { success: false, message: 'Missing data' };
  }

  const userDoc = await adminDb.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const authorName = userData
    ? `${userData.name || ''} ${userData.lastname || ''}`.trim() || 'Anonymous'
    : 'Anonymous';

  await adminDb
    .collection(WATCHLIST_COLLECTION)
    .doc(symbol)
    .collection('comments')
    .add({
      text: text.trim(),
      author_id: userId,
      author_name: authorName,
      created_at: FieldValue.serverTimestamp(),
    });

  return { success: true };
}

export async function updateCommentAction(
  userId: string,
  symbol: string,
  commentId: string,
  text: string,
): Promise<{ success: boolean; message?: string }> {
  if (!userId || !symbol || !commentId || !text.trim()) {
    return { success: false, message: 'Missing data' };
  }

  const commentRef = adminDb
    .collection(WATCHLIST_COLLECTION)
    .doc(symbol)
    .collection('comments')
    .doc(commentId);

  const commentDoc = await commentRef.get();
  if (!commentDoc.exists)
    return { success: false, message: 'Comment not found' };
  if (commentDoc.data()?.author_id !== userId) {
    return { success: false, message: 'Not authorized' };
  }

  await commentRef.update({
    text: text.trim(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return { success: true };
}

export async function deleteCommentAction(
  userId: string,
  symbol: string,
  commentId: string,
): Promise<{ success: boolean; message?: string }> {
  if (!userId || !symbol || !commentId) {
    return { success: false, message: 'Missing data' };
  }

  const commentRef = adminDb
    .collection(WATCHLIST_COLLECTION)
    .doc(symbol)
    .collection('comments')
    .doc(commentId);

  const commentDoc = await commentRef.get();
  if (!commentDoc.exists)
    return { success: false, message: 'Comment not found' };
  if (commentDoc.data()?.author_id !== userId) {
    return { success: false, message: 'Not authorized' };
  }

  await commentRef.delete();
  return { success: true };
}

// --- Analyses ---

export async function getAnalysesAction(
  symbol: string,
  limit: number = 7,
): Promise<StockAnalysis[]> {
  if (!symbol) return [];

  const snapshot = await adminDb
    .collection(WATCHLIST_COLLECTION)
    .doc(symbol)
    .collection('analyses')
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      date: d.date || doc.id,
      symbol: d.symbol || symbol,
      last_price: d.last_price ?? null,
      close_price: d.close_price ?? null,
      open: d.open ?? null,
      high: d.high ?? null,
      low: d.low ?? null,
      volume: d.volume ?? null,
      avg_volume: d.avg_volume ?? null,
      market_cap: d.market_cap ?? null,
      beta: d.beta ?? null,
      pe: d.pe ?? null,
      forward_pe: d.forward_pe ?? null,
      eps: d.eps ?? null,
      forward_eps: d.forward_eps ?? null,
      peg: d.peg ?? null,
      ev_to_ebitda: d.ev_to_ebitda ?? null,
      ev_to_revenue: d.ev_to_revenue ?? null,
      dividend_yield: d.dividend_yield ?? null,
      payout_ratio: d.payout_ratio ?? null,
      profit_margin: d.profit_margin ?? null,
      operating_margin: d.operating_margin ?? null,
      gross_margin: d.gross_margin ?? null,
      revenue_growth: d.revenue_growth ?? null,
      earnings_growth: d.earnings_growth ?? null,
      roe: d.roe ?? null,
      roa: d.roa ?? null,
      current_ratio: d.current_ratio ?? null,
      de_ratio: d.de_ratio ?? null,
      free_cashflow: d.free_cashflow ?? null,
      short_ratio: d.short_ratio ?? null,
      week52_high: d.week52_high ?? null,
      week52_low: d.week52_low ?? null,
      rsi: d.rsi ?? null,
      iv: d.iv ?? null,
      cross_signal: d.cross_signal ?? null,
    };
  });
}

export interface HotTickerInfo {
  symbol: string;
  rsi: number | null;
  iv: number | null;
  last_price: number | null;
  is_hot: boolean;
  cross_signal?: "GC" | "DC" | "GC_COMING" | "DC_COMING" | null;
}

export async function getHotTickersAction(): Promise<HotTickerInfo[]> {
  try {
    const watchlist = await getWatchlistAction();
    if (!watchlist || watchlist.length === 0) return [];

    const promises = watchlist.map(async (item) => {
      try {
        const analyses = await getAnalysesAction(item.symbol, 1);
        if (analyses && analyses.length > 0) {
          const latest = analyses[0];
          // Define HOT condition: RSI <= 40 (Oversold/Low RSI) OR IV >= 45% (High IV) OR any cross signal
          const hasCross = !!latest.cross_signal;
          const isHot =
            hasCross ||
            (latest.rsi != null && latest.rsi <= 40) ||
            (latest.iv != null && latest.iv >= 45);

          return {
            symbol: item.symbol,
            rsi: latest.rsi,
            iv: latest.iv,
            last_price: latest.last_price,
            cross_signal: latest.cross_signal,
            is_hot: isHot,
          };
        }
      } catch (err) {
        console.error(`Error loading analysis for ${item.symbol}:`, err);
      }
      return null;
    });

    const resolved = await Promise.all(promises);
    return resolved.filter((r): r is HotTickerInfo => r !== null);
  } catch (error) {
    console.error('Error in getHotTickersAction:', error);
    return [];
  }
}


export async function checkWatchlistAction(symbol: string): Promise<boolean> {
  if (!symbol) return false;
  const upperSymbol = symbol.toUpperCase().trim();
  const doc = await adminDb.collection(WATCHLIST_COLLECTION).doc(upperSymbol).get();
  return doc.exists;
}
