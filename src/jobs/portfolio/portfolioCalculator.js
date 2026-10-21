import {
  getUserAssets,
  setUserAsset,
  deleteUserAsset,
  setUserIBKRSummary,
  setPortfolioHistory,
  setUserProfile,
  getDb,
} from '../../services/firebase.js';
import { pythonClient } from '../../services/pythonClient.js';
import { logger } from '../../utils/logger.js';
import { toUsd, toMultiCurrency } from './currencyHelper.js';

export const priceCache = new Map();
export const enrichCache = new Map();

export const FIXED_CATEGORIES = [
  { id: 'defensive', name: 'Defensive', target_percentage: 40, type: 'ASSET', color: '#3b82f6' },
  { id: 'growth', name: 'Growth', target_percentage: 40, type: 'ASSET', color: '#10b981' },
  { id: 'cash', name: 'Cash', target_percentage: 20, type: 'CASH', color: '#f59e0b' },
  { id: 'crypto', name: 'Crypto', target_percentage: 0, type: 'CRYPTO', color: '#8b5cf6' },
  { id: 'others', name: 'Others', target_percentage: 0, type: 'ASSET', color: '#6b7280' },
  { id: 'options_sell', name: 'Options Sell', target_percentage: 0, type: 'OPTIONS', color: '#ef4444' },
  { id: 'options_buy', name: 'Options Buy', target_percentage: 0, type: 'OPTIONS', color: '#84cc16' },
];

export function normalizeCategoryId(rawCatId, type = 'ASSET', amount = 0) {
  if (type === 'CASH') return 'cash';
  if (!rawCatId || rawCatId === 'uncategorized') {
    if (type === 'OPTION') {
      return Number(amount) < 0 ? 'options_sell' : 'options_buy';
    }
    return 'uncategorized';
  }
  if (rawCatId === 'adventure' || rawCatId === 'options') {
    return Number(amount) < 0 ? 'options_sell' : 'options_buy';
  }
  if (rawCatId === 'hedge') return 'defensive';
  if (rawCatId === 'other') return 'others';
  return rawCatId;
}

/**
 * Fetch sector/industry from Python service with in-memory cache
 */
export async function fetchEnrich(symbol, currency = 'USD', exchange = 'SMART', secType = 'STK') {
  if (!symbol || secType === 'OPT' || secType === 'CASH' || secType === 'OPTION') return null;
  if (symbol === 'SXRV' || symbol === 'SXRV.DE') {
    return { sector: 'Technology', industry: 'Technology ETF' };
  }

  const cacheKey = `${symbol}_${secType}`;
  if (enrichCache.has(cacheKey)) {
    return enrichCache.get(cacheKey);
  }

  try {
    const enrichRes = await fetch(`http://127.0.0.1:8000/api/enrich-symbols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [{ symbol, currency, exchange, secType }] }),
    });
    if (enrichRes.ok) {
      const json = await enrichRes.json();
      if (json.status === 'success' && json.data && json.data[symbol]) {
        const data = json.data[symbol];
        enrichCache.set(cacheKey, data);
        return data;
      }
    }
  } catch (err) {
    logger.warn(`[Enrich] Failed to fetch enrichment for ${symbol}: ${err.message}`);
  }
  return null;
}

/**
 * Fetch live price in USD from Python service or shared priceCache
 */
export async function fetchPriceInUsd(symbol, currency = 'USD', exchange = 'SMART', secType = 'STK', conId = 0, rates = {}) {
  const cacheKey = conId ? `${symbol}_${secType}_${conId}` : `${symbol}_${secType}`;
  if (priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey);
  }
  if (secType === 'STK' && priceCache.has(symbol)) {
    return priceCache.get(symbol);
  }

  const result = await pythonClient.getPrice(symbol, currency, exchange, secType, conId);
  if (result && result.price !== null && result.price !== undefined && result.price >= 0) {
    const priceUsd = toUsd(result.price, currency, rates);
    if (priceUsd > 0 || secType === 'OPT') {
      priceCache.set(cacheKey, priceUsd);
      return priceUsd;
    }
  }
  return null;
}

/**
 * Builds the standardized Firestore asset payload with pre-calculated { USD, EUR, TRY } objects.
 */
export function buildUnifiedAssetPayload(pos, existingAsset, rates) {
  const amount = Number(pos.amount) || 0;
  const multiplier = Number(pos.multiplier) || 1;
  const type = pos.type || 'ASSET';
  const originalCurrency = pos.original_currency || pos.currency || 'USD';

  const currentPriceUsd = Number(pos.current_price_usd) || 0;
  const avgCostUsd = Number(pos.avg_cost_usd) || 0;
  const costBasisUsd =
    pos.cost_basis_usd !== undefined && pos.cost_basis_usd !== null
      ? Number(pos.cost_basis_usd)
      : avgCostUsd * Math.abs(amount) * multiplier * (amount < 0 ? -1 : 1);

  const marketValueUsd =
    pos.market_value_usd !== undefined && pos.market_value_usd !== null
      ? Number(pos.market_value_usd)
      : currentPriceUsd * amount * multiplier;

  const unrealizedPnlUsd =
    pos.unrealized_pnl_usd !== undefined && pos.unrealized_pnl_usd !== null
      ? Number(pos.unrealized_pnl_usd)
      : type === 'CASH'
        ? 0
        : (currentPriceUsd - avgCostUsd) * amount * multiplier;

  const absCostBasis = Math.abs(costBasisUsd);
  const pnlPercent =
    type === 'CASH' || absCostBasis === 0
      ? 0
      : Number(((unrealizedPnlUsd / absCostBasis) * 100).toFixed(2));

  const preservedCat = existingAsset?.category_id || pos.category_id;
  const categoryId = normalizeCategoryId(preservedCat, type, amount);

  let sector = pos.sector || existingAsset?.sector || null;
  let industry = pos.industry || existingAsset?.industry || null;
  if (pos.symbol === 'SXRV' || pos.symbol === 'SXRV.DE' || String(pos.id).includes('SXRV')) {
    sector = 'Technology';
    industry = 'Technology ETF';
  } else if (type === 'CASH') {
    sector = 'Cash';
    industry = 'Cash';
  }

  const prices = {
    current: toMultiCurrency(currentPriceUsd, rates, 4),
    avg_cost: toMultiCurrency(avgCostUsd, rates, 4),
  };

  const metrics = {
    market_value: toMultiCurrency(marketValueUsd, rates, 2),
    cost_basis: toMultiCurrency(costBasisUsd, rates, 2),
    unrealized_pnl: toMultiCurrency(unrealizedPnlUsd, rates, 2),
    pnl_percent: pnlPercent,
  };

  return {
    id: pos.id,
    symbol: pos.symbol,
    name: pos.name || existingAsset?.name || pos.symbol,
    amount: String(amount),
    avg_cost: String(avgCostUsd),
    current_price: String(currentPriceUsd),
    cost_basis_money: String(costBasisUsd),
    value: String(marketValueUsd),
    market_value: String(marketValueUsd),
    unrealized_pnl: String(unrealizedPnlUsd),
    realized_pnl: existingAsset?.realized_pnl || '0',
    multiplier: String(multiplier),
    currency: 'USD',
    original_currency: originalCurrency,
    original_avg_cost: String(pos.original_avg_cost ?? avgCostUsd),
    source: pos.source || 'IBKR',
    type,
    category_id: categoryId,
    is_active: true,
    strike: pos.strike ? String(pos.strike) : null,
    right: pos.right || null,
    expiry: pos.expiry || null,
    sector: sector || null,
    industry: industry || null,
    prices,
    metrics,
  };
}

/**
 * Processes and normalizes MANUAL assets for a user so they also have the exact same schema & 3 currencies.
 */
async function processManualAssets(userId, existingAssets, rates) {
  const manualAssets = existingAssets.filter((a) => a.source === 'MANUAL' && a.symbol);
  const updatedManualDocs = [];

  for (const asset of manualAssets) {
    const amount = parseFloat(asset.amount) || 0;
    const mult = parseFloat(asset.multiplier) || 1;
    const rawCurrency =
      asset.original_currency || (asset.currency && asset.currency !== 'USD' ? asset.currency : 'USD');

    if (asset.type === 'CASH' || asset.category_id === 'cash') {
      const unitUsd = toUsd(1, rawCurrency, rates);
      const totalCashUsd = amount * unitUsd;
      const unified = buildUnifiedAssetPayload(
        {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name || asset.symbol,
          amount,
          multiplier: 1,
          type: 'CASH',
          source: 'MANUAL',
          category_id: 'cash',
          original_currency: rawCurrency,
          original_avg_cost: 1,
          avg_cost_usd: unitUsd,
          current_price_usd: unitUsd,
          cost_basis_usd: totalCashUsd,
          market_value_usd: totalCashUsd,
          unrealized_pnl_usd: 0,
        },
        asset,
        rates
      );
      await setUserAsset(userId, asset.id, unified);
      updatedManualDocs.push(unified);
      continue;
    }

    let secType = asset.type || 'STK';
    const symUpper = (asset.symbol || '').toUpperCase();
    if (
      asset.category_id === 'crypto' ||
      asset.type === 'CRYPTO' ||
      ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LTC', 'AVAX'].includes(symUpper)
    ) {
      secType = 'CRYPTO';
    } else if (asset.type === 'OPTION' || asset.category_id === 'options' || asset.category_id?.startsWith('options_')) {
      secType = 'OPT';
    }

    const livePriceUsd = await fetchPriceInUsd(
      asset.symbol,
      rawCurrency,
      asset.exchange || 'SMART',
      secType,
      0,
      rates
    );

    const rawAvgCost = parseFloat(asset.original_avg_cost ?? asset.avg_cost) || 0;
    const avgCostUsd = rawCurrency !== 'USD' ? toUsd(rawAvgCost, rawCurrency, rates) : rawAvgCost;
    const fallbackPriceUsd = parseFloat(asset.current_price) || avgCostUsd;
    const currentPriceUsd = livePriceUsd && livePriceUsd > 0 ? livePriceUsd : fallbackPriceUsd;

    const costBasisUsd = avgCostUsd * Math.abs(amount) * mult;
    const marketValueUsd = currentPriceUsd * amount * mult;
    const unrealizedPnlUsd = (currentPriceUsd - avgCostUsd) * amount * mult;

    let sector = asset.sector || null;
    let industry = asset.industry || null;
    if (secType !== 'OPT' && secType !== 'CRYPTO' && (!sector || !industry || sector === 'Unknown')) {
      const enrichData = await fetchEnrich(asset.symbol, rawCurrency, asset.exchange || 'SMART', 'STK');
      if (enrichData) {
        sector = enrichData.sector;
        industry = enrichData.industry;
      }
    }

    const unified = buildUnifiedAssetPayload(
      {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        amount,
        multiplier: mult,
        type: secType === 'OPT' ? 'OPTION' : secType === 'CRYPTO' ? 'CRYPTO' : 'ASSET',
        source: 'MANUAL',
        category_id: asset.category_id,
        original_currency: rawCurrency,
        original_avg_cost: rawAvgCost,
        avg_cost_usd: avgCostUsd,
        current_price_usd: currentPriceUsd,
        cost_basis_usd: amount < 0 ? -costBasisUsd : costBasisUsd,
        market_value_usd: marketValueUsd,
        unrealized_pnl_usd: unrealizedPnlUsd,
        sector,
        industry,
        strike: asset.strike,
        right: asset.right,
        expiry: asset.expiry,
      },
      asset,
      rates
    );

    await setUserAsset(userId, asset.id, unified);
    updatedManualDocs.push(unified);
  }

  return updatedManualDocs;
}

/**
 * Computes and writes the complete portfolio summary, categories, asset allocation,
 * IBKR summary (in 3 currencies), and daily history snapshot for a user.
 */
export async function finalizeUserPortfolio({
  userId,
  brokerPositions = [],
  ibkrSummaryRaw = null,
  openOptionsList = [],
  sourceLabel = 'IBKR',
  rates = {},
  shouldPruneBrokerAssets = false,
}) {
  const db = getDb();
  const existingAssets = await getUserAssets(userId);
  const existingMap = new Map(existingAssets.map((a) => [a.id, a]));

  // Also map by symbol/legacy ID so category assignments aren't lost if option ID format was upgraded
  const legacyCategoryBySymbol = new Map();
  for (const a of existingAssets) {
    if (a.symbol && a.category_id && a.category_id !== 'uncategorized') {
      legacyCategoryBySymbol.set(`${a.symbol}_${a.type || 'ASSET'}`, a.category_id);
    }
  }

  // Fetch closed positions so we don't re-open manually closed positions on Flex Query
  const closedSnap = await db.collection('users').doc(userId).collection('closed_positions').get();
  const closedIds = new Set(closedSnap.docs.map((d) => d.id));

  const seenBrokerIds = new Set();
  const finalActiveAssets = [];

  // 1. Write normalized broker positions
  for (const pos of brokerPositions) {
    if (closedIds.has(pos.id)) continue;
    seenBrokerIds.add(pos.id);

    const existing =
      existingMap.get(pos.id) ||
      existingMap.get(`IBKR_${(pos.symbol || '').replace(/\s+/g, '')}`) ||
      existingMap.get(`FLEX_${(pos.symbol || '').replace(/\s+/g, '')}`);

    if (!pos.category_id && !existing?.category_id) {
      const fallbackCat = legacyCategoryBySymbol.get(`${pos.symbol}_${pos.type || 'ASSET'}`);
      if (fallbackCat) pos.category_id = fallbackCat;
    }

    const unifiedDoc = buildUnifiedAssetPayload(pos, existing, rates);
    await setUserAsset(userId, pos.id, unifiedDoc);
    finalActiveAssets.push(unifiedDoc);
  }

  // 2. Delete stale broker or legacy KRAKEN assets
  for (const asset of existingAssets) {
    if (asset.source === 'KRAKEN') {
      logger.info(`[Calculator] Deleting legacy KRAKEN asset ${asset.id} for ${userId}`);
      await deleteUserAsset(userId, asset.id);
      continue;
    }
    if (shouldPruneBrokerAssets) {
      const isBroker =
        asset.source === 'IBKR' ||
        asset.source === 'FLEX' ||
        String(asset.id).startsWith('IBKR_') ||
        String(asset.id).startsWith('FLEX_');
      if (isBroker && !seenBrokerIds.has(asset.id)) {
        logger.info(`[Calculator] Deleting stale broker asset ${asset.id} for ${userId}`);
        await deleteUserAsset(userId, asset.id);
      }
    } else {
      // If broker sync did not run or was skipped, keep existing broker assets in finalActiveAssets
      const isBroker = asset.source === 'IBKR' || String(asset.id).startsWith('IBKR_');
      if (isBroker && !seenBrokerIds.has(asset.id)) {
        const unifiedExisting = buildUnifiedAssetPayload(
          {
            ...asset,
            avg_cost_usd: parseFloat(asset.avg_cost) || 0,
            current_price_usd: parseFloat(asset.current_price) || 0,
            cost_basis_usd: parseFloat(asset.cost_basis_money) || 0,
            market_value_usd: parseFloat(asset.value ?? asset.market_value) || 0,
            unrealized_pnl_usd: parseFloat(asset.unrealized_pnl) || 0,
          },
          asset,
          rates
        );
        await setUserAsset(userId, asset.id, unifiedExisting);
        finalActiveAssets.push(unifiedExisting);
      }
    }
  }

  // 3. Process Manual Assets
  const manualDocs = await processManualAssets(userId, existingAssets, rates);
  finalActiveAssets.push(...manualDocs);

  // 4. Save IBKR Account Summary with 3 currencies
  if (ibkrSummaryRaw) {
    const netLiq = Number(ibkrSummaryRaw.netLiquidation) || 0;
    const buyingPower = Number(ibkrSummaryRaw.buyingPower) || 0;
    const excessLiq = Number(ibkrSummaryRaw.excessLiquidity) || 0;
    const maintMargin = Number(ibkrSummaryRaw.maintenanceMargin) || 0;
    const initMargin = Number(ibkrSummaryRaw.initialMargin) || 0;
    const totalCash = Number(ibkrSummaryRaw.totalCashValue) || 0;

    await setUserIBKRSummary(userId, {
      netLiquidation: netLiq,
      buyingPower,
      excessLiquidity: excessLiq,
      maintenanceMargin: maintMargin,
      initialMargin: initMargin,
      totalCashValue: totalCash,
      multi_currency: {
        netLiquidation: toMultiCurrency(netLiq, rates, 0),
        buyingPower: toMultiCurrency(buyingPower, rates, 0),
        excessLiquidity: toMultiCurrency(excessLiq, rates, 0),
        maintenanceMargin: toMultiCurrency(maintMargin, rates, 0),
        initialMargin: toMultiCurrency(initMargin, rates, 0),
        totalCashValue: toMultiCurrency(totalCash, rates, 0),
      },
    });
  }

  // 5. Sync open options to options tracker
  if (openOptionsList.length > 0) {
    await autoSyncOptionsToTracker(userId, openOptionsList, sourceLabel);
  }

  // 6. Compute Pre-Calculated Portfolio Summary & Asset Allocation
  await computeAndSavePortfolioSummary(userId, finalActiveAssets, rates);

  // 7. Update user profile timestamp
  try {
    await setUserProfile(userId, { last_updated: new Date().toISOString() });
  } catch (err) {
    logger.warn(`[Calculator] Could not update last_updated for ${userId}: ${err.message}`);
  }
}

/**
 * Calculates totals, category breakdown, asset allocation (with negative cash clamp to 0%),
 * and daily history snapshot, writing both to Firestore.
 */
async function computeAndSavePortfolioSummary(userId, activeAssets, rates) {
  const db = getDb();

  // Fetch user custom category targets & transactions
  const [prefDoc, txSnap] = await Promise.all([
    db.collection('users').doc(userId).collection('settings').doc('preferences').get(),
    db.collection('users').doc(userId).collection('transactions').get(),
  ]);

  const customTargets = prefDoc.exists ? prefDoc.data()?.category_targets || {} : {};
  const transactions = txSnap.docs.map((d) => d.data());

  let totalValueUsd = 0;
  let totalUnrealizedPnlUsd = 0;
  let totalCostBasisUsd = 0;
  let cashBalanceUsd = 0;
  const categoryValuesUsd = new Map();

  for (const asset of activeAssets) {
    const mvUsd = asset.metrics?.market_value?.USD ?? (parseFloat(asset.value) || 0);
    const pnlUsd = asset.metrics?.unrealized_pnl?.USD ?? (parseFloat(asset.unrealized_pnl) || 0);
    const cbUsd = asset.metrics?.cost_basis?.USD ?? (parseFloat(asset.cost_basis_money) || 0);

    totalValueUsd += mvUsd;
    totalUnrealizedPnlUsd += pnlUsd;
    totalCostBasisUsd += cbUsd;

    if (asset.type === 'CASH' || asset.category_id === 'cash') {
      cashBalanceUsd += mvUsd;
    }

    const catId = asset.category_id || 'uncategorized';
    categoryValuesUsd.set(catId, (categoryValuesUsd.get(catId) || 0) + mvUsd);
  }

  let totalInvestedUsd = 0;
  for (const t of transactions) {
    const amt = Number(t.amount) || 0;
    const valUsd = toUsd(amt, t.currency || 'USD', rates);
    if (t.type === 'DEPOSIT') totalInvestedUsd += valUsd;
    else if (t.type === 'WITHDRAWAL') totalInvestedUsd -= valUsd;
  }

  const totalPnlUsd = totalValueUsd - totalInvestedUsd;
  const pnlPercentage =
    totalInvestedUsd !== 0 ? Number(((totalPnlUsd / totalInvestedUsd) * 100).toFixed(2)) : 0;

  let totalPositiveCategoryUsd = 0;
  for (const val of categoryValuesUsd.values()) {
    if (val > 0) totalPositiveCategoryUsd += val;
  }

  const categoriesSummary = FIXED_CATEGORIES.map((cat) => {
    const valUsd = categoryValuesUsd.get(cat.id) || 0;
    const targetPct =
      typeof customTargets[cat.id] === 'number' ? customTargets[cat.id] : cat.target_percentage;

    // Negative category (e.g. negative margin cash) should NEVER get a positive allocation %
    let actualPct = 0;
    if (valUsd > 0 && totalPositiveCategoryUsd > 0) {
      actualPct = Number(((valUsd / totalPositiveCategoryUsd) * 100).toFixed(2));
    } else if (valUsd < 0 && totalValueUsd > 0) {
      actualPct = Number(((valUsd / totalValueUsd) * 100).toFixed(2));
    }

    return {
      id: cat.id,
      name: cat.name,
      type: cat.type,
      color: cat.color,
      value: Number(valUsd.toFixed(2)),
      values: toMultiCurrency(valUsd, rates, 2),
      actual_percentage: actualPct,
      target_percentage: targetPct,
    };
  });

  // Also include 'uncategorized' if any uncategorized assets exist
  const uncatValUsd = categoryValuesUsd.get('uncategorized') || 0;
  if (uncatValUsd !== 0) {
    categoriesSummary.unshift({
      id: 'uncategorized',
      name: 'Uncategorized',
      type: 'ASSET',
      color: '#9ca3af',
      value: Number(uncatValUsd.toFixed(2)),
      values: toMultiCurrency(uncatValUsd, rates, 2),
      actual_percentage:
        uncatValUsd > 0 && totalPositiveCategoryUsd > 0
          ? Number(((uncatValUsd / totalPositiveCategoryUsd) * 100).toFixed(2))
          : 0,
      target_percentage: 0,
    });
  }

  // Asset Allocation (Non-option assets, strictly clamping negative cash/values to 0% in pie chart)
  const nonOptionAssets = activeAssets.filter((a) => {
    const isOpt =
      a.type === 'OPTION' ||
      Boolean(a.strike) ||
      Boolean(a.expiry) ||
      Boolean(a.right) ||
      String(a.category_id).startsWith('options') ||
      String(a.id).includes('_OPT_');
    return !isOpt;
  });

  // Only strictly positive market values enter the pie chart!
  // Negative cash (margin balance like -$8,000) MUST NOT be Math.abs()'d into +$8,000!
  const positiveAllocationItems = [];
  for (const a of nonOptionAssets) {
    const mvUsd = a.metrics?.market_value?.USD ?? (parseFloat(a.value) || 0);
    if (mvUsd > 0) {
      positiveAllocationItems.push({
        symbol: a.symbol,
        name: a.name || a.symbol,
        type: a.type || 'ASSET',
        value_usd: mvUsd,
        values: toMultiCurrency(mvUsd, rates, 2),
      });
    }
  }

  const totalPositiveAllocatedUsd = positiveAllocationItems.reduce((s, i) => s + i.value_usd, 0);
  positiveAllocationItems.sort((a, b) => b.value_usd - a.value_usd);

  const assetAllocation = positiveAllocationItems.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    type: item.type,
    value: Number(item.value_usd.toFixed(2)),
    values: item.values,
    percent:
      totalPositiveAllocatedUsd > 0
        ? Number((item.value_usd / totalPositiveAllocatedUsd).toFixed(4))
        : 0,
  }));

  const portfolioSummaryDoc = {
    total_value: Number(totalValueUsd.toFixed(2)),
    total_cost: Number(totalInvestedUsd.toFixed(2)),
    total_pnl: Number(totalPnlUsd.toFixed(2)),
    unrealized_pnl: Number(totalUnrealizedPnlUsd.toFixed(2)),
    cash_balance: Number(cashBalanceUsd.toFixed(2)),
    pnl_percentage: pnlPercentage,
    base_currency: 'USD',
    totals: {
      total_value: toMultiCurrency(totalValueUsd, rates, 2),
      total_cost: toMultiCurrency(totalInvestedUsd, rates, 2),
      total_pnl: toMultiCurrency(totalPnlUsd, rates, 2),
      unrealized_pnl: toMultiCurrency(totalUnrealizedPnlUsd, rates, 2),
      cash_balance: toMultiCurrency(cashBalanceUsd, rates, 2),
    },
    categories: categoriesSummary,
    asset_allocation: assetAllocation,
    rates: {
      USD: 1,
      EUR: rates.EUR || 1.08,
      TRY: rates.TRY || 0.0292,
    },
    updated_at: new Date().toISOString(),
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('configuration')
    .doc('portfolio_summary')
    .set(portfolioSummaryDoc);

  // Write Daily History Snapshot
  const today = new Date().toISOString().slice(0, 10);
  const historyAllocation = categoriesSummary.map((c) => ({
    category_id: c.id,
    name: c.name,
    type: c.type,
    value: c.value,
    values: c.values,
    percentage: c.actual_percentage,
  }));

  await setPortfolioHistory(userId, today, {
    allocation: historyAllocation,
    asset_count: activeAssets.length,
    daily_transaction_count: 0,
    date: today,
    timestamp: new Date(),
    total_cost_basis: Number(totalCostBasisUsd.toFixed(2)),
    total_market_value: Number(totalValueUsd.toFixed(2)),
    totals: {
      total_cost_basis: toMultiCurrency(totalCostBasisUsd, rates, 2),
      total_market_value: toMultiCurrency(totalValueUsd, rates, 2),
    },
  });

  logger.info(
    `[Calculator] Saved unified portfolio summary & history for ${userId}: Total=$${totalValueUsd.toFixed(2)}, Cash=$${cashBalanceUsd.toFixed(2)}`
  );
}

/**
 * Auto-syncs open broker option positions to the user's options tracker collection.
 */
export async function autoSyncOptionsToTracker(userId, openOptionsList, source) {
  try {
    const db = getDb();
    const snap = await db.collection('users').doc(userId).collection('options').get();
    const existingTrackerOptions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const todayStr = new Date().toISOString().split('T')[0];
    const cleanUnderlyingSymbol = (s) => (s ? s.trim().split(/\s+/)[0].toUpperCase() : '');

    // Pre-normalize legs so we can detect multi-leg strategies (Spreads, Iron Condors, Strangles)
    const normalizedLegs = openOptionsList.map((opt) => {
      let expiryIso = opt.expiry;
      if (expiryIso && !expiryIso.includes('-')) {
        const y = expiryIso.slice(0, 4);
        const m = expiryIso.slice(4, 6);
        const d = expiryIso.slice(6, 8);
        expiryIso = `${y}-${m}-${d}`;
      }
      const parsedStrike = parseFloat(opt.strike) || 0;
      const absoluteQty = Math.abs(opt.qty);
      const isShort = opt.qty < 0;
      const optionType = isShort
        ? opt.right === 'P'
          ? 'SELL_PUT'
          : 'SELL_CALL'
        : opt.right === 'P'
          ? 'BUY_PUT'
          : 'BUY_CALL';

      return {
        ...opt,
        symbol: cleanUnderlyingSymbol(opt.symbol),
        expiryIso,
        parsedStrike,
        absoluteQty,
        isShort,
        optionType,
      };
    });

    // Group legs by symbol + expiryIso to detect multi-leg combos
    const comboMap = new Map();
    for (const leg of normalizedLegs) {
      const key = `${leg.symbol}_${leg.expiryIso || 'NOEXP'}`;
      if (!comboMap.has(key)) comboMap.set(key, []);
      comboMap.get(key).push(leg);
    }

    for (const opt of normalizedLegs) {
      const { expiryIso, parsedStrike, absoluteQty, isShort, optionType } = opt;
      const comboKey = `${opt.symbol}_${expiryIso || 'NOEXP'}`;
      const siblingLegs = comboMap.get(comboKey) || [opt];

      // Auto-detect strategy if multiple legs share symbol + expiry
      let autoGroupId = null;
      let autoStrategyName = null;
      if (siblingLegs.length >= 2) {
        const types = new Set(siblingLegs.map((l) => l.optionType));
        if (types.has('SELL_PUT') && types.has('BUY_PUT') && types.has('SELL_CALL') && types.has('BUY_CALL')) {
          autoGroupId = `AUTO_${comboKey}_IC`;
          autoStrategyName = 'Iron Condor';
        } else if (types.has('SELL_PUT') && types.has('BUY_PUT')) {
          const sp = siblingLegs.find((l) => l.optionType === 'SELL_PUT');
          const bp = siblingLegs.find((l) => l.optionType === 'BUY_PUT');
          autoGroupId = `AUTO_${comboKey}_PS`;
          autoStrategyName = sp.parsedStrike >= bp.parsedStrike ? 'Bull Put Spread' : 'Bear Put Spread';
        } else if (types.has('SELL_CALL') && types.has('BUY_CALL')) {
          const sc = siblingLegs.find((l) => l.optionType === 'SELL_CALL');
          const bc = siblingLegs.find((l) => l.optionType === 'BUY_CALL');
          autoGroupId = `AUTO_${comboKey}_CS`;
          autoStrategyName = sc.parsedStrike <= bc.parsedStrike ? 'Bear Call Spread' : 'Bull Call Spread';
        } else if (types.has('SELL_PUT') && types.has('SELL_CALL')) {
          autoGroupId = `AUTO_${comboKey}_SS`;
          autoStrategyName = 'Short Strangle / Straddle';
        } else if (types.has('BUY_PUT') && types.has('BUY_CALL')) {
          autoGroupId = `AUTO_${comboKey}_LS`;
          autoStrategyName = 'Long Strangle / Straddle';
        } else {
          autoGroupId = `AUTO_${comboKey}_MULTI`;
          autoStrategyName = 'Multi-Leg Strategy';
        }
      }

      const optCleanSymbol = opt.symbol;

      const foundMatch = existingTrackerOptions.find((o) => {
        const isClosed = !!o.buy_date && !!o.sell_date;
        return (
          !isClosed &&
          cleanUnderlyingSymbol(o.symbol) === optCleanSymbol &&
          parseFloat(o.strike_price) === parsedStrike &&
          o.expiry_date === expiryIso &&
          o.type === optionType
        );
      });

      let dte = 1;
      if (expiryIso) {
        const expDate = new Date(expiryIso);
        const todayDate = new Date();
        const diffTime = expDate.getTime() - todayDate.getTime();
        dte = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      let marginRequired = 0;
      let aroc = 0;

      if (optionType === 'SELL_PUT') {
        const protectivePut = siblingLegs.find(
          (l) => l.optionType === 'BUY_PUT' && l.parsedStrike < parsedStrike
        );
        const shortPremium = Math.abs(opt.perShareAvgCost) || 0;

        if (protectivePut) {
          // Credit Put Spread margin: (Strike Width - Net Credit) * 100 * qty
          const longPremium = Math.abs(protectivePut.perShareAvgCost) || 0;
          const netCredit = Math.max(0, shortPremium - longPremium);
          const strikeWidth = Math.max(0, parsedStrike - protectivePut.parsedStrike);
          const maxRiskPerShare = Math.max(0, strikeWidth - netCredit);
          marginRequired = maxRiskPerShare * 100 * absoluteQty;
          if (maxRiskPerShare > 0) {
            aroc = (netCredit / maxRiskPerShare / dte) * 365 * 100;
          }
        } else {
          // Single-leg Cash-Secured Put margin
          const breakEven = parsedStrike - shortPremium;
          marginRequired = breakEven * 100 * absoluteQty;
          if (breakEven > 0) {
            aroc = (shortPremium / breakEven / dte) * 365 * 100;
          }
        }
      } else if (optionType === 'SELL_CALL') {
        const protectiveCall = siblingLegs.find(
          (l) => l.optionType === 'BUY_CALL' && l.parsedStrike > parsedStrike
        );
        const shortPremium = Math.abs(opt.perShareAvgCost) || 0;

        if (protectiveCall) {
          // Credit Call Spread margin: (Strike Width - Net Credit) * 100 * qty
          const longPremium = Math.abs(protectiveCall.perShareAvgCost) || 0;
          const netCredit = Math.max(0, shortPremium - longPremium);
          const strikeWidth = Math.max(0, protectiveCall.parsedStrike - parsedStrike);
          const maxRiskPerShare = Math.max(0, strikeWidth - netCredit);
          marginRequired = maxRiskPerShare * 100 * absoluteQty;
          if (maxRiskPerShare > 0) {
            aroc = (netCredit / maxRiskPerShare / dte) * 365 * 100;
          }
        }
      }

      if (foundMatch) {
        const patch = {};
        if (opt.greeks) {
          patch.delta = opt.greeks.delta || null;
          patch.theta = opt.greeks.theta || null;
          patch.vega = opt.greeks.vega || null;
          patch.iv = opt.greeks.iv || null;
        }
        if (opt.currentPrice !== undefined && opt.currentPrice !== null) {
          patch.current_price = opt.currentPrice;
        }
        if (opt.iv_rank !== undefined && opt.iv_rank !== null) {
          patch.iv_rank = opt.iv_rank;
        }
        if (opt.earnings_date !== undefined && opt.earnings_date !== null) {
          patch.earnings_date = opt.earnings_date;
        }
        if (foundMatch.quantity !== absoluteQty) {
          patch.quantity = absoluteQty;
        }
        if (foundMatch.symbol !== optCleanSymbol) {
          patch.symbol = optCleanSymbol;
        }
        if (autoGroupId && (!foundMatch.group_id || String(foundMatch.group_id).startsWith('AUTO_'))) {
          patch.group_id = autoGroupId;
          patch.strategy_name = autoStrategyName;
        }
        patch.margin_required = marginRequired;
        patch.aroc = aroc;
        patch.dte = dte;

        if (Object.keys(patch).length > 0) {
          await db.collection('users').doc(userId).collection('options').doc(foundMatch.id).update(patch);
        }
      } else {
        const docRef = db.collection('users').doc(userId).collection('options').doc();
        const toDisplayDate = (iso) => {
          if (!iso) return '';
          const [y, m, d] = iso.split('-');
          return `${d}.${m}.${y}`;
        };

        const newOptionDoc = {
          id: docRef.id,
          symbol: optCleanSymbol,
          type: optionType,
          quantity: absoluteQty,
          buy_date: isShort ? null : todayStr,
          sell_date: isShort ? todayStr : null,
          buy_price: isShort ? null : opt.perShareAvgCost,
          sell_price: isShort ? opt.perShareAvgCost : null,
          strike_price: parsedStrike,
          expiry_date: expiryIso,
          target: `${parsedStrike}$ / ${toDisplayDate(expiryIso)}`,
          note: `Auto-added from ${source}`,
          created_at: Date.now(),
          current_price: opt.currentPrice ?? null,
          iv_rank: opt.iv_rank ?? null,
          earnings_date: opt.earnings_date || null,
          margin_required: marginRequired,
          aroc,
          dte,
          group_id: autoGroupId,
          strategy_name: autoStrategyName,
        };

        if (opt.greeks) {
          newOptionDoc.delta = opt.greeks.delta || null;
          newOptionDoc.theta = opt.greeks.theta || null;
          newOptionDoc.vega = opt.greeks.vega || null;
          newOptionDoc.iv = opt.greeks.iv || null;
        }

        await docRef.set(newOptionDoc);
      }
    }
  } catch (error) {
    logger.error(`[AutoOptions] Error auto-syncing options for user ${userId}: ${error.message}`);
  }
}
