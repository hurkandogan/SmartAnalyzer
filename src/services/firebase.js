import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let db;

export function initFirebase() {
  const serviceAccount = JSON.parse(
    readFileSync(config.FIREBASE_SERVICE_ACCOUNT, 'utf-8'),
  );
  initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore();
  logger.info('Firebase Admin SDK initialized');
}

export function getDb() {
  return db;
}

// ── Currencies ────────────────────────────────────────────────
export async function setCurrency(id, data) {
  await db.collection('currencies').doc(id).set(data, { merge: true });
}

// ── Users ─────────────────────────────────────────────────────
export async function getAllUserIds() {
  // listDocuments returns both real and virtual docs (docs with only subcollections)
  const refs = await db.collection('users').listDocuments();
  return refs.map((ref) => ref.id);
}

export async function getUserFlexCredentials(userId) {
  const doc = await db.collection('users').doc(userId).collection('config').doc('ibkr').get();
  return doc.exists ? doc.data() : null;
}

// ── Assets ────────────────────────────────────────────────────
export async function getUserAssets(userId) {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('assets')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function setUserAsset(userId, assetId, data) {
  await db
    .collection('users')
    .doc(userId)
    .collection('assets')
    .doc(assetId)
    .set(
      { ...data, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
}

export async function deleteUserAsset(userId, assetId) {
  await db
    .collection('users')
    .doc(userId)
    .collection('assets')
    .doc(assetId)
    .delete();
  logger.info(`Deleted asset ${assetId} for user ${userId}`);
}

// ── Portfolio History ─────────────────────────────────────────
export async function setPortfolioHistory(userId, date, data) {
  await db
    .collection('users')
    .doc(userId)
    .collection('portfolio_history')
    .doc(date)
    .set(data);
}

// ── Stocks (analysis watchlist) ───────────────────────────────
export async function setStockData(symbol, data) {
  await db
    .collection('stocks')
    .doc(symbol)
    .set(
      { ...data, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
}

// ── Watchlist ─────────────────────────────────────────────────
export async function getWatchlist() {
  const snap = await db
    .collection('watchlist')
    .orderBy('added_at', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addWatchlistItem(symbol, data) {
  await db
    .collection('watchlist')
    .doc(symbol)
    .set({ ...data, symbol, added_at: FieldValue.serverTimestamp() });
}

export async function updateWatchlistItem(symbol, data) {
  await db
    .collection('watchlist')
    .doc(symbol)
    .set(
      { ...data, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
}

export async function addStockAnalysis(symbol, date, data) {
  await db
    .collection('watchlist')
    .doc(symbol)
    .collection('analyses')
    .doc(date)
    .set({ ...data, saved_at: FieldValue.serverTimestamp() });
}

export async function removeWatchlistItem(symbol) {
  await db.collection('watchlist').doc(symbol).delete();
}

export async function getWatchlistSymbols() {
  const snap = await db.collection('watchlist').get();
  return snap.docs.map((d) => d.id);
}

export async function addWatchlistComment(symbol, commentId, data) {
  await db
    .collection('watchlist')
    .doc(symbol)
    .collection('comments')
    .doc(commentId)
    .set({ ...data, updated_at: FieldValue.serverTimestamp() }, { merge: true });
}
