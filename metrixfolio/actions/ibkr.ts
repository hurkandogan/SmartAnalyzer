'use server';

import { adminDb } from '@/utils/firebase-admin';
import { CollectionType } from '@/types/settings';
import { IBKRAsset, IBKRCashPosition, ibkrDateToIso } from '@/utils/ibkr-parser';

export interface IBKRConfig {
  ibkr_query_id: string;
  ibkr_token: string;
  ibkr_last_sync: string | null; // ISO date YYYY-MM-DD
}

// ── Firestore config helpers ────────────────────────────────────────────────

export async function getIBKRConfigAction(userId: string): Promise<IBKRConfig | null> {
  if (!userId) return null;
  try {
    const doc = await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection(CollectionType.CONFIG)
      .doc(CollectionType.MAIN)
      .get();

    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      ibkr_query_id: data.ibkr_query_id ?? '',
      ibkr_token: data.ibkr_token ?? '',
      ibkr_last_sync: data.ibkr_last_sync ?? null,
    };
  } catch (err) {
    console.error('getIBKRConfigAction error:', err);
    return null;
  }
}

export async function saveIBKRConfigAction(
  userId: string,
  queryId: string,
  token: string,
) {
  if (!userId) return { success: false, message: 'Not authenticated' };
  try {
    await adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection(CollectionType.CONFIG)
      .doc(CollectionType.MAIN)
      .set({ ibkr_query_id: queryId, ibkr_token: token }, { merge: true });

    return { success: true };
  } catch (err: any) {
    console.error('saveIBKRConfigAction error:', err);
    return { success: false, message: err.message };
  }
}

// ── Flex Query fetch ────────────────────────────────────────────────────────

const FLEX_SEND_URL =
  'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest';
const FLEX_GET_URL =
  'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement';

async function fetchIBKRXml(queryId: string, token: string): Promise<string> {
  // Step 1: request the report
  const sendRes = await fetch(
    `${FLEX_SEND_URL}?t=${token}&q=${queryId}&v=3`,
    { cache: 'no-store' },
  );
  const sendText = await sendRes.text();

  const refMatch = sendText.match(/<ReferenceCode>(.*?)<\/ReferenceCode>/);
  if (!refMatch) {
    throw new Error('Could not get IBKR reference code. Response: ' + sendText.slice(0, 200));
  }
  const referenceCode = refMatch[1];

  // Step 2: poll until the report is ready (usually immediate)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 1000 : 2000));
    const getRes = await fetch(
      `${FLEX_GET_URL}?q=${referenceCode}&t=${token}&v=3`,
      { cache: 'no-store' },
    );
    const getText = await getRes.text();
    if (getText.includes('<FlexQueryResponse')) return getText;
    if (getText.includes('ErrorCode=1019')) continue; // Statement still generating
    throw new Error('IBKR error response: ' + getText.slice(0, 300));
  }

  throw new Error('IBKR report timed out after 5 attempts');
}

// ── Asset sync ──────────────────────────────────────────────────────────────

async function syncPositionsToFirestore(
  userId: string,
  assets: IBKRAsset[],
  cashPositions: IBKRCashPosition[],
  reportDate: string,
) {
  const assetsRef = adminDb
    .collection(CollectionType.USERS)
    .doc(userId)
    .collection(CollectionType.ASSETS);

  // Fetch existing IBKR assets to preserve category_id
  const existing = await assetsRef.where('source', '==', 'IBKR').get();
  const categoryMap = new Map<string, string>();
  existing.docs.forEach((d) => {
    const catId = d.data().category_id;
    if (catId) categoryMap.set(d.id, catId);
  });

  const updatedAt = Math.floor(Date.now() / 1000);
  const batch = adminDb.batch();

  const writePosition = (pos: IBKRAsset | IBKRCashPosition) => {
    const ref = assetsRef.doc(pos.id);
    const preservedCategory = categoryMap.get(pos.id) ?? 'uncategorized';
    batch.set(ref, {
      ...pos,
      category_id: preservedCategory,
      updated_at: updatedAt,
    }, { merge: true });
  };

  assets.forEach(writePosition);
  cashPositions.forEach(writePosition);

  // Update last sync date in config
  const isoDate = ibkrDateToIso(reportDate) || new Date().toISOString().slice(0, 10);
  batch.set(
    adminDb
      .collection(CollectionType.USERS)
      .doc(userId)
      .collection(CollectionType.CONFIG)
      .doc(CollectionType.MAIN),
    { ibkr_last_sync: isoDate },
    { merge: true },
  );

  await batch.commit();
  return isoDate;
}

// ── Main action ─────────────────────────────────────────────────────────────

export async function syncIBKRAction(userId: string): Promise<{
  success: boolean;
  message?: string;
  lastSync?: string;
  synced?: number;
}> {
  if (!userId) return { success: false, message: 'Not authenticated' };

  try {
    const config = await getIBKRConfigAction(userId);
    if (!config?.ibkr_query_id || !config?.ibkr_token) {
      return { success: false, message: 'IBKR credentials not configured' };
    }

    const xmlString = await fetchIBKRXml(config.ibkr_query_id, config.ibkr_token);

    // Parse on server using basic string matching (DOMParser not available server-side)
    const { parseIBKRXmlServer } = await import('@/utils/ibkr-parser-server');
    const { assets, cashPositions, reportDate } = parseIBKRXmlServer(xmlString);

    const lastSync = await syncPositionsToFirestore(userId, assets, cashPositions, reportDate);

    return {
      success: true,
      lastSync,
      synced: assets.length + cashPositions.length,
    };
  } catch (err: any) {
    console.error('syncIBKRAction error:', err);
    return { success: false, message: err.message };
  }
}

// ── Sync from uploaded XML (client-parsed, write only) ─────────────────────

export async function syncIBKRFromParsedAction(
  userId: string,
  assets: IBKRAsset[],
  cashPositions: IBKRCashPosition[],
  reportDate: string,
): Promise<{ success: boolean; message?: string; lastSync?: string }> {
  if (!userId) return { success: false, message: 'Not authenticated' };
  try {
    const lastSync = await syncPositionsToFirestore(userId, assets, cashPositions, reportDate);
    return { success: true, lastSync };
  } catch (err: any) {
    console.error('syncIBKRFromParsedAction error:', err);
    return { success: false, message: err.message };
  }
}
