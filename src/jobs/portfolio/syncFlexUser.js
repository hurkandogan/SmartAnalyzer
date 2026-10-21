import {
  getUserAssets,
  getUserFlexCredentials,
  getAllUserIds,
  getDb,
} from '../../services/firebase.js';
import { fetchAndParseFlexQuery } from '../../services/flexQuery.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { toUsd } from './currencyHelper.js';
import {
  fetchEnrich,
  fetchPriceInUsd,
  finalizeUserPortfolio,
} from './portfolioCalculator.js';

const toArray = (obj) => {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : [obj];
};

/**
 * Syncs all non-Gateway users (e.g. Göker via IBKR Flex Query + Manual Assets),
 * outputting the exact same unified schema and 3-currency summary as Gateway users.
 */
export async function syncAllOtherUsers(rates) {
  const allUserIds = await getAllUserIds();
  const userIds = allUserIds.filter((id) => id !== config.FIREBASE_USER_ID);

  for (const userId of userIds) {
    try {
      const flexCreds = await getUserFlexCredentials(userId);
      if (flexCreds && flexCreds.flex_token && flexCreds.flex_query_id) {
        await syncFlexUser(userId, flexCreds, rates);
      } else {
        logger.info(`[FlexSync] User ${userId} has no Flex credentials. Syncing manual assets & summary only.`);
        await finalizeUserPortfolio({
          userId,
          brokerPositions: [],
          ibkrSummaryRaw: null,
          openOptionsList: [],
          sourceLabel: 'MANUAL',
          rates,
          shouldPruneBrokerAssets: false,
        });
      }
    } catch (err) {
      logger.error(`[FlexSync] Error syncing user ${userId}: ${err.message}`);
    }
  }
}

/**
 * Syncs a single Flex Query user (e.g. Göker) and runs the shared portfolio calculator.
 */
export async function syncFlexUser(userId, flexCreds, rates) {
  logger.info(`[FlexSync] Syncing user ${userId} via IBKR Flex Query`);

  const existingAssets = await getUserAssets(userId);
  const existingMap = new Map(existingAssets.map((a) => [a.id, a]));

  let statement;
  try {
    statement = await fetchAndParseFlexQuery(flexCreds.flex_token, flexCreds.flex_query_id);
  } catch (err) {
    logger.warn(
      `[FlexSync] Could not fetch live Flex XML for ${userId} (${err.message}). Re-calculating existing positions with latest prices & 3 currencies.`
    );
    await recalculateExistingFlexPositions(userId, existingAssets, rates);
    return;
  }

  const brokerPositions = [];
  const openOptionsList = [];

  // 1. Account Summary (Flex Query)
  let ibkrSummaryRaw = null;
  const acctInfo = statement?.AccountInformation?.$;
  const acctBaseCcy = acctInfo?.currency || 'USD';
  if (acctInfo) {
    ibkrSummaryRaw = {
      netLiquidation: toUsd(parseFloat(acctInfo.netLiquidation) || 0, acctBaseCcy, rates),
      buyingPower: toUsd(parseFloat(acctInfo.buyingPower) || 0, acctBaseCcy, rates),
      excessLiquidity: toUsd(parseFloat(acctInfo.excessLiquidity) || 0, acctBaseCcy, rates),
      maintenanceMargin: toUsd(parseFloat(acctInfo.maintMarginReq) || 0, acctBaseCcy, rates),
      initialMargin: toUsd(parseFloat(acctInfo.initMarginReq) || 0, acctBaseCcy, rates),
      totalCashValue: 0,
    };
  }

  // 2. Cash Report -> Single Unified IBKR_USD Cash Position
  let totalCashUsd = 0;
  const cashReports = toArray(statement?.CashReport?.CashReportCurrency);
  for (const cash of cashReports) {
    const cAttrs = cash?.$;
    if (!cAttrs || cAttrs.currency === 'BASE_SUMMARY') continue;
    const val = parseFloat(cAttrs.endingCash) || 0;
    const cur = cAttrs.currency || 'USD';
    totalCashUsd += toUsd(val, cur, rates);
  }

  if (ibkrSummaryRaw) {
    ibkrSummaryRaw.totalCashValue = totalCashUsd;
  }

  brokerPositions.push({
    id: 'IBKR_USD',
    symbol: 'USD',
    name: 'USD Cash',
    amount: totalCashUsd,
    multiplier: 1,
    type: 'CASH',
    source: 'IBKR',
    category_id: 'cash',
    original_currency: 'USD',
    original_avg_cost: 1,
    avg_cost_usd: 1,
    current_price_usd: 1,
    cost_basis_usd: totalCashUsd,
    market_value_usd: totalCashUsd,
    unrealized_pnl_usd: 0,
    sector: 'Cash',
    industry: 'Cash',
  });

  // 3. Open Positions (Stocks & Options)
  const openPositions = toArray(statement?.OpenPositions?.OpenPosition);

  for (const pos of openPositions) {
    const attrs = pos?.$;
    if (!attrs || parseFloat(attrs.position) === 0) continue;

    const rawSymbol = attrs.symbol || '';
    const assetCategory = attrs.assetCategory || 'STK';
    const isOption = assetCategory === 'OPT';
    const qty = parseFloat(attrs.position) || 0;
    const multiplierNum = parseFloat(attrs.multiplier) || (isOption ? 100 : 1);
    const currency = attrs.currency || 'USD';

    const cleanUnderlying = isOption
      ? (attrs.underlyingSymbol || rawSymbol.trim().split(/\s+/)[0]).replace(/\s+/g, '')
      : rawSymbol.replace(/\s+/g, '');

    const normalizedRaw = rawSymbol.replace(/\s+/g, '');
    const conId = attrs.conid || attrs.conId || '';
    const openDateTime = attrs.openDateTime ? `_${attrs.openDateTime.replace(/\D/g, '')}` : '';

    // Standardize ID while checking any legacy Flex IDs to preserve category_id
    const id = isOption
      ? conId
        ? `IBKR_${cleanUnderlying}_OPT_${conId}`
        : `IBKR_${normalizedRaw}`
      : `IBKR_${cleanUnderlying}`;

    const existing =
      existingMap.get(id) ||
      existingMap.get(`IBKR_${normalizedRaw}`) ||
      existingMap.get(`IBKR_${normalizedRaw}${openDateTime}`) ||
      existingMap.get(`FLEX_${normalizedRaw}`);

    // Extract per-share cost basis in native currency and convert to USD
    let rawPerShareCost = Math.abs(parseFloat(attrs.costBasisPrice) || 0);
    if (rawPerShareCost === 0 && attrs.costBasisMoney) {
      const totalCostMoney = Math.abs(parseFloat(attrs.costBasisMoney) || 0);
      if (Math.abs(qty) * multiplierNum > 0) {
        rawPerShareCost = totalCostMoney / (Math.abs(qty) * multiplierNum);
      }
    }

    const perShareAvgCostUsd = toUsd(rawPerShareCost, currency, rates);
    const costBasisUsd = perShareAvgCostUsd * Math.abs(qty) * multiplierNum;

    const markPriceRaw = parseFloat(attrs.markPrice) || 0;
    const markPriceUsd = toUsd(markPriceRaw, currency, rates);

    let currentPriceUsd = markPriceUsd;
    let marketValueUsd;
    let unrealizedPnlUsd;

    if (isOption) {
      currentPriceUsd = markPriceUsd;
      if (attrs.positionValue !== undefined && !isNaN(parseFloat(attrs.positionValue))) {
        marketValueUsd = toUsd(parseFloat(attrs.positionValue), currency, rates);
      } else {
        marketValueUsd = currentPriceUsd * qty * multiplierNum;
      }

      if (attrs.fifoPnlUnrealized !== undefined && !isNaN(parseFloat(attrs.fifoPnlUnrealized))) {
        unrealizedPnlUsd = toUsd(parseFloat(attrs.fifoPnlUnrealized), currency, rates);
      } else {
        unrealizedPnlUsd = (currentPriceUsd - perShareAvgCostUsd) * qty * multiplierNum;
      }
    } else {
      // Stock/ETF: Try live price from shared priceCache / Python service first
      const livePriceUsd = await fetchPriceInUsd(cleanUnderlying, currency, 'SMART', 'STK', 0, rates);
      if (livePriceUsd && livePriceUsd > 0) {
        currentPriceUsd = livePriceUsd;
        marketValueUsd = currentPriceUsd * qty * multiplierNum;
        unrealizedPnlUsd = (currentPriceUsd - perShareAvgCostUsd) * qty * multiplierNum;
      } else {
        currentPriceUsd = markPriceUsd > 0 ? markPriceUsd : perShareAvgCostUsd;
        if (attrs.positionValue !== undefined && !isNaN(parseFloat(attrs.positionValue))) {
          marketValueUsd = toUsd(parseFloat(attrs.positionValue), currency, rates);
        } else {
          marketValueUsd = currentPriceUsd * qty * multiplierNum;
        }
        if (attrs.fifoPnlUnrealized !== undefined && !isNaN(parseFloat(attrs.fifoPnlUnrealized))) {
          unrealizedPnlUsd = toUsd(parseFloat(attrs.fifoPnlUnrealized), currency, rates);
        } else {
          unrealizedPnlUsd = (currentPriceUsd - perShareAvgCostUsd) * qty * multiplierNum;
        }
      }
    }

    let sector = existing?.sector || null;
    let industry = existing?.industry || null;
    if (cleanUnderlying === 'SXRV' || cleanUnderlying === 'SXRV.DE') {
      sector = 'Technology';
      industry = 'Technology ETF';
    } else if (!isOption && (!sector || !industry || sector === 'Unknown')) {
      const enrichData = await fetchEnrich(cleanUnderlying, currency, 'SMART', 'STK');
      if (enrichData) {
        sector = enrichData.sector;
        industry = enrichData.industry;
      }
    }

    const strikeStr = isOption ? String(attrs.strike || '0') : null;
    const rightStr = isOption ? attrs.putCall || attrs.right || null : null;
    const expiryStr = isOption ? attrs.expiry || attrs.lastTradeDateOrContractMonth || null : null;

    let displayName = cleanUnderlying;
    if (isOption) {
      displayName =
        attrs.description ||
        `${cleanUnderlying} ${strikeStr || ''} ${rightStr || ''} ${expiryStr || ''}`.trim();
    } else if (existing?.name) {
      displayName = existing.name;
    }

    if (isOption) {
      openOptionsList.push({
        symbol: cleanUnderlying,
        strike: strikeStr || '0',
        right: rightStr,
        expiry: expiryStr,
        qty,
        perShareAvgCost: perShareAvgCostUsd,
        currentPrice: currentPriceUsd,
        greeks: null,
      });
    }

    brokerPositions.push({
      id,
      symbol: cleanUnderlying,
      name: displayName,
      amount: qty,
      multiplier: multiplierNum,
      type: isOption ? 'OPTION' : 'ASSET',
      source: 'IBKR',
      category_id: existing?.category_id,
      original_currency: currency,
      original_avg_cost: rawPerShareCost,
      avg_cost_usd: perShareAvgCostUsd,
      current_price_usd: currentPriceUsd,
      cost_basis_usd: qty < 0 ? -costBasisUsd : costBasisUsd,
      market_value_usd: marketValueUsd,
      unrealized_pnl_usd: unrealizedPnlUsd,
      strike: strikeStr,
      right: rightStr,
      expiry: expiryStr,
      sector,
      industry,
    });
  }

  await finalizeUserPortfolio({
    userId,
    brokerPositions,
    ibkrSummaryRaw,
    openOptionsList,
    sourceLabel: 'IBKR Flex Query',
    rates,
    shouldPruneBrokerAssets: true,
  });

  // Update ibkr_last_sync in configuration/main so Metrixfolio shows the sync date
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    await getDb()
      .collection('users')
      .doc(userId)
      .collection('configuration')
      .doc('main')
      .set({ ibkr_last_sync: todayIso }, { merge: true });
  } catch (err) {
    logger.warn(`[FlexSync] Failed updating ibkr_last_sync for ${userId}: ${err.message}`);
  }

  logger.info(
    `[FlexSync] Completed for ${userId}: ${brokerPositions.length} broker positions (Cash=$${totalCashUsd.toFixed(2)})`
  );
}

/**
 * Fallback if IBKR Flex Query service is temporarily unreachable or rate-limited:
 * repairs any corrupted currency/PnL fields on existing Firestore IBKR positions and refreshes live stock prices.
 */
async function recalculateExistingFlexPositions(userId, existingAssets, rates) {
  const brokerPositions = [];
  const ibkrAssets = existingAssets.filter(
    (a) => a.source === 'IBKR' || a.source === 'FLEX' || String(a.id).startsWith('IBKR_')
  );

  let totalCashUsd = 0;
  let hasCash = false;

  for (const a of ibkrAssets) {
    const amount = parseFloat(a.amount) || 0;
    if (amount === 0) continue;

    // Consolidate any multi-currency cash docs (IBKR_USD, IBKR_EUR, etc.) into IBKR_USD
    if (a.type === 'CASH' || a.category_id === 'cash' || String(a.id).startsWith('IBKR_USD') || String(a.id).startsWith('IBKR_EUR')) {
      hasCash = true;
      const ccy = a.original_currency || (a.id === 'IBKR_EUR' ? 'EUR' : a.currency || 'USD');
      totalCashUsd += toUsd(amount, ccy, rates);
      continue;
    }

    const isOption =
      a.type === 'OPTION' ||
      Boolean(a.strike) ||
      Boolean(a.right) ||
      String(a.id).includes('_OPT_');
    const mult = parseFloat(a.multiplier) || (isOption ? 100 : 1);
    const origCcy = a.original_currency || (a.currency && a.currency !== 'USD' ? a.currency : 'USD');

    const rawAvgCost = Math.abs(parseFloat(a.original_avg_cost ?? a.avg_cost) || 0);
    // If asset.currency was left as non-USD by old frontend parser, convert from origCcy; else if already USD, keep
    const wasUnconverted = a.currency && a.currency !== 'USD';
    const avgCostUsd = wasUnconverted
      ? toUsd(parseFloat(a.avg_cost) || 0, a.currency, rates)
      : a.original_avg_cost !== undefined
        ? toUsd(rawAvgCost, origCcy, rates)
        : parseFloat(a.avg_cost) || 0;

    let currentPriceUsd = wasUnconverted
      ? toUsd(parseFloat(a.current_price) || 0, a.currency, rates)
      : parseFloat(a.current_price) || avgCostUsd;

    const cleanSym = (a.symbol || '').replace(/\s+/g, '');
    if (!isOption && cleanSym) {
      const liveUsd = await fetchPriceInUsd(cleanSym, origCcy, 'SMART', 'STK', 0, rates);
      if (liveUsd && liveUsd > 0) {
        currentPriceUsd = liveUsd;
      }
    }

    const costBasisUsd = avgCostUsd * Math.abs(amount) * mult;
    const marketValueUsd = currentPriceUsd * amount * mult;
    const unrealizedPnlUsd = (currentPriceUsd - avgCostUsd) * amount * mult;

    brokerPositions.push({
      id: a.id,
      symbol: cleanSym || a.symbol,
      name: a.name || a.symbol,
      amount,
      multiplier: mult,
      type: isOption ? 'OPTION' : 'ASSET',
      source: 'IBKR',
      category_id: a.category_id,
      original_currency: origCcy,
      original_avg_cost: rawAvgCost || avgCostUsd,
      avg_cost_usd: avgCostUsd,
      current_price_usd: currentPriceUsd,
      cost_basis_usd: amount < 0 ? -costBasisUsd : costBasisUsd,
      market_value_usd: marketValueUsd,
      unrealized_pnl_usd: unrealizedPnlUsd,
      strike: a.strike || null,
      right: a.right || null,
      expiry: a.expiry || null,
      sector: a.sector || null,
      industry: a.industry || null,
    });
  }

  if (hasCash) {
    brokerPositions.push({
      id: 'IBKR_USD',
      symbol: 'USD',
      name: 'USD Cash',
      amount: totalCashUsd,
      multiplier: 1,
      type: 'CASH',
      source: 'IBKR',
      category_id: 'cash',
      original_currency: 'USD',
      original_avg_cost: 1,
      avg_cost_usd: 1,
      current_price_usd: 1,
      cost_basis_usd: totalCashUsd,
      market_value_usd: totalCashUsd,
      unrealized_pnl_usd: 0,
      sector: 'Cash',
      industry: 'Cash',
    });
  }

  await finalizeUserPortfolio({
    userId,
    brokerPositions,
    ibkrSummaryRaw: null,
    openOptionsList: [],
    sourceLabel: 'IBKR Flex Query (Cached)',
    rates,
    shouldPruneBrokerAssets: true,
  });
}
