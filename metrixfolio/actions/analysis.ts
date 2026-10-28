'use server';

import { adminDb } from '@/utils/firebase-admin';

function serializeFirestoreData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (typeof obj.toMillis === 'function') {
    return new Date(obj.toMillis()).toISOString();
  }
  if (typeof obj === 'object' && '_seconds' in obj && '_nanoseconds' in obj) {
    return new Date(obj._seconds * 1000 + obj._nanoseconds / 1000000).toISOString();
  }
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeFirestoreData);
  }
  if (typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      res[key] = serializeFirestoreData(obj[key]);
    }
    return res;
  }
  return obj;
}

export interface AnalysisPositionTransaction {
  id: string;
  type: 'BUY' | 'PARTIAL_SELL' | 'STOP_HIT' | 'STOP_UPDATE';
  shares: number;
  price: number;
  pnl_usd?: number;
  pnl_pct?: number;
  date: string;
  note?: string;
}

export interface AnalysisPosition {
  id: string;
  symbol: string;
  status: 'OPEN' | 'CLOSED_WIN' | 'STOPPED_OUT';
  entry_price: number;
  initial_shares: number;
  remaining_shares: number;
  stop_price: number;
  realized_pnl_usd: number;
  transactions: AnalysisPositionTransaction[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface PublicStockNote {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
}

export async function getAnalysisCandidatesAction() {
  try {
    const snapshot = await adminDb.collection('assets').get();
    const assets: any[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.analysis) {
        const qulla = data.analysis.qullamaggie;
        if (!qulla) return;
        const status = qulla.status;
        const score = Number(qulla.score) || 0;
        if (status === 'no_setup' || (status !== 'candidate' && status !== 'watch') || score <= 0) {
          return;
        }

        assets.push(
          serializeFirestoreData({
            symbol: doc.id,
            ...data,
          })
        );
      }
    });

    return assets;
  } catch (err) {
    console.error('Failed to fetch analysis candidates:', err);
    return [];
  }
}

export async function getDroppedAnalysesAction() {
  try {
    const docSnap = await adminDb.collection('screener').doc('dropped_analyses').get();
    if (!docSnap.exists) return [];
    const data = serializeFirestoreData(docSnap.data());
    return Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    console.error('Failed to fetch dropped analyses:', err);
    return [];
  }
}

export async function getUserAnalysisDataAction(uid: string) {
  if (!uid) {
    return {
      totalPortfolioUsd: 0,
      riskLimitPct: 5,
      positions: [] as AnalysisPosition[],
    };
  }

  try {
    const [summarySnap, userSnap, posSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).collection('configuration').doc('portfolio_summary').get(),
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('users').doc(uid).collection('analysis_positions').get(),
    ]);

    const summaryData = summarySnap.exists ? summarySnap.data() : null;
    const totalPortfolioUsd =
      Number(summaryData?.total_value ?? summaryData?.totals?.total_value?.USD ?? 0) || 0;

    const userData = userSnap.exists ? userSnap.data() : null;
    const rawLimit = Number(userData?.analysis_risk_limit_pct);
    const riskLimitPct =
      !isNaN(rawLimit) && rawLimit >= 1 && rawLimit <= 10 ? Math.round(rawLimit) : 5;

    const positions: AnalysisPosition[] = posSnap.docs.map((d) => {
      const raw = serializeFirestoreData(d.data());
      return {
        id: d.id,
        symbol: raw.symbol || '',
        status: raw.status || 'OPEN',
        entry_price: Number(raw.entry_price) || 0,
        initial_shares: Number(raw.initial_shares) || 0,
        remaining_shares: Number(raw.remaining_shares) || 0,
        stop_price: Number(raw.stop_price) || 0,
        realized_pnl_usd: Number(raw.realized_pnl_usd) || 0,
        transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
        created_at: raw.created_at || new Date().toISOString(),
        updated_at: raw.updated_at || new Date().toISOString(),
        closed_at: raw.closed_at || undefined,
      };
    });

    // Sort open first, then newest
    positions.sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });

    return {
      totalPortfolioUsd,
      riskLimitPct,
      positions,
    };
  } catch (err) {
    console.error('Failed to fetch user analysis data:', err);
    return {
      totalPortfolioUsd: 0,
      riskLimitPct: 5,
      positions: [] as AnalysisPosition[],
    };
  }
}

export async function saveUserRiskLimitAction(uid: string, pct: number) {
  if (!uid) return { success: false, message: 'Not authenticated' };
  const clamped = Math.min(10, Math.max(1, Math.round(Number(pct) || 5)));
  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .set({ analysis_risk_limit_pct: clamped, updated_at: new Date().toISOString() }, { merge: true });
    return { success: true, riskLimitPct: clamped };
  } catch (err: any) {
    console.error('Error saving risk limit:', err);
    return { success: false, message: err.message };
  }
}

export async function openAnalysisPositionAction(
  uid: string,
  payload: {
    symbol: string;
    entryPrice: number;
    shares: number;
    stopPrice: number;
    note?: string;
  }
) {
  if (!uid || !payload.symbol) return { success: false, message: 'Missing required parameters' };
  const entryPrice = Number(payload.entryPrice);
  const shares = Number(payload.shares);
  const stopPrice = Number(payload.stopPrice);

  if (isNaN(entryPrice) || entryPrice <= 0 || isNaN(shares) || shares <= 0 || isNaN(stopPrice) || stopPrice < 0) {
    return { success: false, message: 'Invalid price, shares, or stop values' };
  }

  try {
    const now = new Date().toISOString();
    const posRef = adminDb.collection('users').doc(uid).collection('analysis_positions').doc();

    const initialTx: AnalysisPositionTransaction = {
      id: `tx_${Date.now()}`,
      type: 'BUY',
      shares,
      price: entryPrice,
      date: now,
      note: payload.note || 'Initial position opened',
    };

    const newPos: AnalysisPosition = {
      id: posRef.id,
      symbol: payload.symbol.toUpperCase(),
      status: 'OPEN',
      entry_price: entryPrice,
      initial_shares: shares,
      remaining_shares: shares,
      stop_price: stopPrice,
      realized_pnl_usd: 0,
      transactions: [initialTx],
      created_at: now,
      updated_at: now,
    };

    await posRef.set(newPos);
    return { success: true, position: newPos };
  } catch (err: any) {
    console.error('Error opening analysis position:', err);
    return { success: false, message: err.message };
  }
}

export async function updatePositionStopAction(
  uid: string,
  payload: { positionId: string; newStopPrice: number }
) {
  if (!uid || !payload.positionId) return { success: false, message: 'Missing parameters' };
  const newStop = Number(payload.newStopPrice);
  if (isNaN(newStop) || newStop < 0) return { success: false, message: 'Invalid stop price' };

  try {
    const posRef = adminDb.collection('users').doc(uid).collection('analysis_positions').doc(payload.positionId);
    const snap = await posRef.get();
    if (!snap.exists) return { success: false, message: 'Position not found' };

    const data = snap.data() as AnalysisPosition;
    const now = new Date().toISOString();
    const tx: AnalysisPositionTransaction = {
      id: `tx_${Date.now()}`,
      type: 'STOP_UPDATE',
      shares: data.remaining_shares,
      price: newStop,
      date: now,
      note: `Stop updated from $${Number(data.stop_price).toFixed(2)} to $${newStop.toFixed(2)}`,
    };

    const updatedTxs = [...(data.transactions || []), tx];
    await posRef.update({
      stop_price: newStop,
      transactions: updatedTxs,
      updated_at: now,
    });

    return {
      success: true,
      position: { ...serializeFirestoreData(data), id: snap.id, stop_price: newStop, transactions: updatedTxs, updated_at: now },
    };
  } catch (err: any) {
    console.error('Error updating position stop:', err);
    return { success: false, message: err.message };
  }
}

export async function recordPartialSellAction(
  uid: string,
  payload: {
    positionId: string;
    sharesToSell: number;
    sellPrice: number;
    note?: string;
  }
) {
  if (!uid || !payload.positionId) return { success: false, message: 'Missing parameters' };
  const sharesToSell = Number(payload.sharesToSell);
  const sellPrice = Number(payload.sellPrice);

  if (isNaN(sharesToSell) || sharesToSell <= 0 || isNaN(sellPrice) || sellPrice <= 0) {
    return { success: false, message: 'Invalid shares or sell price' };
  }

  try {
    const posRef = adminDb.collection('users').doc(uid).collection('analysis_positions').doc(payload.positionId);
    const snap = await posRef.get();
    if (!snap.exists) return { success: false, message: 'Position not found' };

    const data = snap.data() as AnalysisPosition;
    const currentRem = Number(data.remaining_shares) || 0;
    if (sharesToSell > currentRem + 0.0001) {
      return { success: false, message: `Cannot sell more than remaining ${currentRem} shares` };
    }

    const entryPrice = Number(data.entry_price) || 0;
    const legPnlUsd = Number(((sellPrice - entryPrice) * sharesToSell).toFixed(2));
    const legPnlPct = entryPrice > 0 ? Number((((sellPrice - entryPrice) / entryPrice) * 100).toFixed(2)) : 0;

    const newRemaining = Math.max(0, Number((currentRem - sharesToSell).toFixed(4)));
    const newRealized = Number(((Number(data.realized_pnl_usd) || 0) + legPnlUsd).toFixed(2));
    const newStatus = newRemaining <= 0 ? 'CLOSED_WIN' : 'OPEN';
    const now = new Date().toISOString();

    const tx: AnalysisPositionTransaction = {
      id: `tx_${Date.now()}`,
      type: 'PARTIAL_SELL',
      shares: sharesToSell,
      price: sellPrice,
      pnl_usd: legPnlUsd,
      pnl_pct: legPnlPct,
      date: now,
      note: payload.note || (newRemaining <= 0 ? 'Final exit sale' : 'Partial profit taking'),
    };

    const updatedTxs = [...(data.transactions || []), tx];
    const patch: Record<string, any> = {
      remaining_shares: newRemaining,
      realized_pnl_usd: newRealized,
      status: newStatus,
      transactions: updatedTxs,
      updated_at: now,
    };
    if (newStatus !== 'OPEN') {
      patch.closed_at = now;
    }

    await posRef.update(patch);

    return {
      success: true,
      position: { ...serializeFirestoreData(data), id: snap.id, ...patch },
    };
  } catch (err: any) {
    console.error('Error recording partial sell:', err);
    return { success: false, message: err.message };
  }
}

export async function triggerStopHitAction(
  uid: string,
  payload: {
    positionId: string;
    stopExecPrice: number;
    note?: string;
  }
) {
  if (!uid || !payload.positionId) return { success: false, message: 'Missing parameters' };
  const stopExecPrice = Number(payload.stopExecPrice);
  if (isNaN(stopExecPrice) || stopExecPrice <= 0) {
    return { success: false, message: 'Invalid stop execution price' };
  }

  try {
    const posRef = adminDb.collection('users').doc(uid).collection('analysis_positions').doc(payload.positionId);
    const snap = await posRef.get();
    if (!snap.exists) return { success: false, message: 'Position not found' };

    const data = snap.data() as AnalysisPosition;
    const remShares = Number(data.remaining_shares) || 0;
    const entryPrice = Number(data.entry_price) || 0;

    const legPnlUsd = Number(((stopExecPrice - entryPrice) * remShares).toFixed(2));
    const legPnlPct = entryPrice > 0 ? Number((((stopExecPrice - entryPrice) / entryPrice) * 100).toFixed(2)) : 0;
    const newRealized = Number(((Number(data.realized_pnl_usd) || 0) + legPnlUsd).toFixed(2));
    const now = new Date().toISOString();

    const tx: AnalysisPositionTransaction = {
      id: `tx_${Date.now()}`,
      type: 'STOP_HIT',
      shares: remShares,
      price: stopExecPrice,
      pnl_usd: legPnlUsd,
      pnl_pct: legPnlPct,
      date: now,
      note: payload.note || `Stopped out ${remShares} shares @ $${stopExecPrice.toFixed(2)}`,
    };

    const updatedTxs = [...(data.transactions || []), tx];
    const patch = {
      remaining_shares: 0,
      realized_pnl_usd: newRealized,
      status: 'STOPPED_OUT' as const,
      transactions: updatedTxs,
      updated_at: now,
      closed_at: now,
    };

    await posRef.update(patch);

    return {
      success: true,
      position: { ...serializeFirestoreData(data), id: snap.id, ...patch },
    };
  } catch (err: any) {
    console.error('Error triggering stop hit:', err);
    return { success: false, message: err.message };
  }
}

export async function deleteAnalysisPositionAction(uid: string, positionId: string) {
  if (!uid || !positionId) return { success: false, message: 'Missing parameters' };
  try {
    await adminDb.collection('users').doc(uid).collection('analysis_positions').doc(positionId).delete();
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting analysis position:', err);
    return { success: false, message: err.message };
  }
}

export async function addStockNoteAction(payload: {
  symbol: string;
  text: string;
  authorUid: string;
  authorName: string;
}) {
  if (!payload.symbol || !payload.text?.trim() || !payload.authorUid) {
    return { success: false, message: 'Missing note text or user' };
  }

  try {
    const sym = payload.symbol.toUpperCase();
    const docRef = adminDb.collection('assets').doc(sym);
    const snap = await docRef.get();
    const existingNotes: PublicStockNote[] = snap.exists && Array.isArray(snap.data()?.notes) ? snap.data()!.notes : [];

    const newNote: PublicStockNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: payload.text.trim(),
      authorUid: payload.authorUid,
      authorName: payload.authorName || 'Trader',
      createdAt: new Date().toISOString(),
    };

    const updatedNotes = [...existingNotes, newNote];
    await docRef.set({ notes: updatedNotes }, { merge: true });

    return { success: true, notes: updatedNotes };
  } catch (err: any) {
    console.error('Error adding stock note:', err);
    return { success: false, message: err.message };
  }
}

export async function deleteStockNoteAction(payload: {
  symbol: string;
  noteId: string;
  requesterUid: string;
}) {
  if (!payload.symbol || !payload.noteId || !payload.requesterUid) {
    return { success: false, message: 'Missing parameters' };
  }

  try {
    const sym = payload.symbol.toUpperCase();
    const docRef = adminDb.collection('assets').doc(sym);
    const snap = await docRef.get();
    if (!snap.exists) return { success: false, message: 'Asset not found' };

    const existingNotes: PublicStockNote[] = Array.isArray(snap.data()?.notes) ? snap.data()!.notes : [];
    const updatedNotes = existingNotes.filter(
      (n) => !(n.id === payload.noteId && n.authorUid === payload.requesterUid)
    );

    await docRef.set({ notes: updatedNotes }, { merge: true });
    return { success: true, notes: updatedNotes };
  } catch (err: any) {
    console.error('Error deleting stock note:', err);
    return { success: false, message: err.message };
  }
}
