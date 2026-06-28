import { config } from '../config/index.js';
import { pythonClient } from '../services/pythonClient.js';
import {
  getUserAssets,
  setUserAsset,
  deleteUserAsset,
  getAllUserIds,
  getUserFlexCredentials,
} from '../services/firebase.js';
import { fetchAndParseFlexQuery } from '../services/flexQuery.js';
import { logger } from '../utils/logger.js';

const priceCache = new Map();

/**
 * Fetch price from Python service
 */
async function fetchPrice(symbol, currency = 'USD', exchange = 'SMART', secType = 'STK', conId = 0, currencies = {}) {
  if (priceCache.has(symbol)) {
    return priceCache.get(symbol);
  }

  const result = await pythonClient.getPrice(symbol, currency, exchange, secType, conId);
  if (result && result.price > 0) {
    let price = result.price;
    // Convert to USD
    if (currency !== 'USD' && currencies[currency]) {
      price = price * currencies[currency];
    }
    priceCache.set(symbol, price);
    return price;
  }
  return null;
}

export async function runPortfolioSync() {
  logger.info('── Portfolio Sync started via Python service ──');
  priceCache.clear();

  let currencies = {};
  try {
    currencies = await pythonClient.getCurrencies() || {};
    currencies['USD'] = 1.0;
  } catch (err) {
    logger.warn('Could not fetch currencies, defaulting to 1.0');
  }

  try {
    await syncPrivateUser(currencies);
  } catch (err) {
    logger.error(`Private user sync failed: ${err.message}`);
  }

  try {
    await syncOtherUsers(currencies);
  } catch (err) {
    logger.error(`Other users sync failed: ${err.message}`);
  }

  logger.info('── Portfolio Sync done ──');
  return { success: true };
}

async function syncPrivateUser(currencies) {
  const userId = config.FIREBASE_USER_ID;
  logger.info(`[Private] Syncing ${userId} via Python`);

  // Fetch Firebase state
  const firebaseAssets = await getUserAssets(userId);
  const firebaseMap = new Map(firebaseAssets.map((a) => [a.id, a]));

  // Fetch portfolio raw data from Python Service
  const portfolioData = await pythonClient.getPortfolio();
  if (!portfolioData || portfolioData.status !== 'success') {
    logger.error('[Private] Failed to fetch portfolio data from Python service. Skipping.');
    return;
  }

  const { ibkr, kraken } = portfolioData;

  // ── IBKR Positions ─────────────────────────────────────────
  const ibkrSeenIds = new Set();
  const ibkrPositions = ibkr.positions || [];
  const ibkrConnected = ibkr.connected;

  if (ibkrConnected && ibkr.positions !== null) {
    for (const pos of ibkrPositions) {
      const { contract, position: qty, avgCost } = pos;
      if (!contract) continue;

      const isOption = contract.secType === 'OPT';
      const localSymbol = (contract.symbol || '').replace(/\s+/g, '');
      // Options MUST have a unique ID using conId to prevent overwriting the underlying stock!
      const id = isOption ? `IBKR_${localSymbol}_OPT_${contract.conId}` : `IBKR_${localSymbol}`;
      ibkrSeenIds.add(id);

      const costBasis = avgCost * Math.abs(qty);
      const existing = firebaseMap.get(id);

      // Extract the true per-share average cost
      const multiplierNum = parseFloat(contract.multiplier || '1') || 1;
      const perShareAvgCost = isOption ? avgCost / multiplierNum : avgCost;

      // Fetch from IBKR portfolio directly!
      let price = pos.marketPrice;
      
      if (!price || price <= 0) {
        // fetchPrice already converts to USD and caches it
        price = await fetchPrice(contract.symbol, contract.currency || 'USD', contract.exchange || 'SMART', contract.secType || 'STK', contract.conId || 0, currencies);
      } else {
        // Convert raw marketPrice to USD if needed
        const currency = contract.currency || 'USD';
        if (price > 0 && currency !== 'USD') {
          const rate = currencies[currency] || 1;
          price = price * rate;
        }
        
        // Cache the USD price for other public users!
        if (price > 0 && contract.symbol) {
          priceCache.set(contract.symbol, price);
        }
      }
      
      const currentPrice = price && price > 0 ? String(price) : existing?.current_price || '0';

      if (existing) {
        const patch = {
          amount: String(qty),
          avg_cost: String(perShareAvgCost),
          cost_basis_money: String(qty < 0 ? -costBasis : costBasis),
          current_price: currentPrice,
          value: String(pos.marketValue || 0),
          multiplier: String(contract.multiplier || '1'),
        };
        await setUserAsset(userId, id, patch);
        logger.info(`[Private] Patched ${id} → price=${currentPrice} qty=${qty}`);
      } else {
        // Format option name beautifully if it has strike and right
        let optionName = `${contract.symbol} Option`;
        if (contract.strike && contract.right) {
          optionName = `${contract.symbol} ${contract.strike} ${contract.right} ${contract.lastTradeDateOrContractMonth || ''}`.trim();
        }
        
        const newAsset = {
          id,
          symbol: contract.symbol,
          name: isOption ? optionName : contract.symbol,
          amount: String(qty),
          avg_cost: String(perShareAvgCost),
          cost_basis_money: String(qty < 0 ? -costBasis : costBasis),
          currency: contract.currency || 'USD',
          current_price: currentPrice,
          value: String(pos.marketValue || 0),
          realized_pnl: '0',
          multiplier: String(contract.multiplier || '1'),
          source: 'IBKR',
          type: isOption ? 'OPTION' : 'ASSET',
          is_active: true,
        };
        await setUserAsset(userId, id, newAsset);
        logger.info(`[Private] New IBKR asset added: ${id}`);
      }
    }

    // ── IBKR Cash Balances ───────────────────────────────────
    const cashBalances = ibkr.cash || {};
    for (const [currency, balance] of Object.entries(cashBalances)) {
      const id = `IBKR_${currency}`;
      ibkrSeenIds.add(id);
      const existing = firebaseMap.get(id);

      const currentPrice = currencies[currency] || 1.0;
      const costBasis = balance * currentPrice;

      if (existing) {
        await setUserAsset(userId, id, {
          amount: String(balance),
          cost_basis_money: String(costBasis),
          current_price: String(currentPrice),
          is_active: true,
        });
      } else {
        await setUserAsset(userId, id, {
          id,
          symbol: currency,
          name: `${currency} Cash`,
          amount: String(balance),
          avg_cost: String(currentPrice),
          current_price: String(currentPrice),
          cost_basis_money: String(costBasis),
          realized_pnl: '0',
          multiplier: '1',
          currency,
          source: 'IBKR',
          type: 'CASH',
          category_id: 'cash',
          industry: 'Cash',
          sector: 'Cash',
          is_active: true,
        });
      }
    }

    // Deletes stale IBKR assets
    const hasExistingIbkrAssets = firebaseAssets.some((a) => a.source === 'IBKR' && a.type !== 'CASH');
    if (ibkrSeenIds.size > 0 || !hasExistingIbkrAssets) {
      for (const asset of firebaseAssets) {
        if (asset.source === 'IBKR' && !ibkrSeenIds.has(asset.id)) {
          logger.info(`[Private] Deleting stale IBKR asset: ${asset.id}`);
          await deleteUserAsset(userId, asset.id);
        }
      }
    }
  }

  // ── Kraken Balances ────────────────────────────────────────
  const krakenSeenIds = new Set();
  const krakenBalances = kraken.balances || {};

  for (const [symbol, amount] of Object.entries(krakenBalances)) {
    const id = `KRAKEN_${symbol}`;
    krakenSeenIds.add(id);
    const existing = firebaseMap.get(id);
    
    // Fetch price for Kraken symbol
    const price = await fetchPrice(symbol, 'USD', '', 'CRYPTO', 0, currencies);
    const currentPrice = price && price > 0 ? String(price) : existing?.current_price || '0';

    if (existing) {
      await setUserAsset(userId, id, {
        amount: String(amount),
        current_price: currentPrice,
        is_active: true,
      });
    } else {
      await setUserAsset(userId, id, {
        id,
        symbol,
        name: symbol,
        amount: String(amount),
        avg_cost: '0',
        current_price: currentPrice,
        cost_basis_money: '0',
        multiplier: '1.0',
        currency: 'USD',
        source: 'KRAKEN',
        type: 'CRYPTO',
        category_id: 'crypto',
        is_active: true,
      });
    }
  }

  // Delete stale Kraken assets if API was successfully read
  if (Object.keys(krakenBalances).length > 0) {
    for (const asset of firebaseAssets) {
      if (asset.source === 'KRAKEN' && !krakenSeenIds.has(asset.id)) {
        logger.info(`[Private] Deleting stale Kraken asset: ${asset.id}`);
        await deleteUserAsset(userId, asset.id);
      }
    }
  }

  // ── MANUAL Asset Prices ───────────────────────────────────
  const manualAssets = firebaseAssets.filter((a) => a.source === 'MANUAL' && a.symbol);
  for (const asset of manualAssets) {
    if (asset.type === 'CASH') {
      const currentPrice = currencies[asset.currency || 'USD'] || 1.0;
      await setUserAsset(userId, asset.id, { current_price: String(currentPrice) });
      continue;
    }

    const isCrypto = asset.type === 'CRYPTO';
    const price = await fetchPrice(asset.symbol, asset.currency || 'USD', asset.exchange || 'SMART', isCrypto ? 'CRYPTO' : 'STK', 0, currencies);
    if (price && price > 0) {
      await setUserAsset(userId, asset.id, { current_price: String(price) });
      logger.info(`[Private] MANUAL ${asset.id} updated → ${price}`);
    }
  }

  // Portfolio history snapshot
  try {
    await writePortfolioHistory(userId);
  } catch (err) {
    logger.error(`[Private] Portfolio history failed: ${err.message}`);
  }
}

async function syncOtherUsers(currencies) {
  const allUserIds = await getAllUserIds();
  const userIds = allUserIds.filter((id) => id !== config.FIREBASE_USER_ID);

  for (const userId of userIds) {
    logger.info(`[Users] Syncing prices for user ${userId}`);
    const flexCreds = await getUserFlexCredentials(userId);

    if (flexCreds && flexCreds.flex_token && flexCreds.flex_query_id) {
      await syncFlexUser(userId, flexCreds, currencies);
    } else {
      // Legacy manual sync for users without flex queries
      const assets = await getUserAssets(userId);
      for (const asset of assets) {
        if (!asset.symbol) continue;
        try {
          if (asset.type === 'CASH') {
            const currentPrice = currencies[asset.currency || 'USD'] || 1.0;
            await setUserAsset(userId, asset.id, { current_price: String(currentPrice) });
            continue;
          }
          const isCrypto = asset.type === 'CRYPTO';
          const price = await fetchPrice(asset.symbol, asset.currency || 'USD', asset.exchange || 'SMART', isCrypto ? 'CRYPTO' : 'STK', 0, currencies);
          if (price && price > 0) {
            await setUserAsset(userId, asset.id, { current_price: String(price) });
          }
        } catch (err) {
          logger.warn(`[Users] ${asset.id} for ${userId}: ${err.message}`);
        }
      }
    }

    try {
      await writePortfolioHistory(userId);
    } catch (err) {
      logger.error(`[Users] History for ${userId} failed: ${err.message}`);
    }
  }
}

async function syncFlexUser(userId, flexCreds, currencies) {
  logger.info(`[Flex] Syncing user ${userId} via IBKR Flex Query`);
  try {
    const statement = await fetchAndParseFlexQuery(flexCreds.flex_token, flexCreds.flex_query_id);
    const existingAssets = await getUserAssets(userId);
    const existingMap = new Map(existingAssets.map((a) => [a.id, a]));
    const seenIds = new Set();

    // Sum up all cash lines to a single USD position
    let totalCashUsd = 0;
    
    // Some XML nodes can be arrays or single objects. Ensure array.
    const toArray = (obj) => {
      if (!obj) return [];
      return Array.isArray(obj) ? obj : [obj];
    };

    const cashReports = toArray(statement?.CashReport?.CashReportCurrency);
    for (const cash of cashReports) {
      if (cash.$.currency === 'BASE_SUMMARY') continue; // We will sum it up ourselves to USD
      
      const val = parseFloat(cash.$.endingCash) || 0;
      const cur = cash.$.currency || 'USD';
      
      // Convert to USD and add to total
      const rateToUsd = currencies[cur] || 1;
      totalCashUsd += val * rateToUsd;
    }

    if (totalCashUsd !== 0) {
      const cashId = `FLEX_CASH_USD`;
      seenIds.add(cashId);
      
      await setUserAsset(userId, cashId, {
        id: cashId,
        symbol: 'USD',
        name: 'USD Cash',
        amount: String(totalCashUsd),
        avg_cost: '1',
        current_price: '1',
        cost_basis_money: String(totalCashUsd),
        realized_pnl: '0',
        multiplier: '1',
        currency: 'USD',
        source: 'FLEX',
        type: 'CASH',
        category_id: 'cash',
        industry: 'Cash',
        sector: 'Cash',
        is_active: true,
      });
    }

    const openPositions = toArray(statement?.OpenPositions?.OpenPosition);
    for (const pos of openPositions) {
      const attrs = pos.$;
      if (!attrs || parseFloat(attrs.position) === 0) continue;

      const symbol = attrs.symbol;
      const assetCategory = attrs.assetCategory || '';
      const qty = parseFloat(attrs.position) || 0;
      const multiplierNum = parseFloat(attrs.multiplier) || 1;
      const currency = attrs.currency || 'USD';
      
      const isOption = assetCategory === 'OPT';
      const localSymbol = symbol.replace(/\s+/g, '');
      const id = `FLEX_${localSymbol}`;
      seenIds.add(id);

      // Flex cost basis is usually total money, but attributes.costBasisPrice is per share.
      let perShareCost = parseFloat(attrs.costBasisPrice) || 0;
      // Convert cost to USD if needed (assuming costBasisPrice is in local currency)
      if (currency !== 'USD') {
         perShareCost = perShareCost * (currencies[currency] || 1);
      }
      
      const costBasisUsd = perShareCost * Math.abs(qty) * multiplierNum;

      let currentPriceUsd = 0;
      let markPrice = parseFloat(attrs.markPrice) || 0;

      if (isOption) {
        // For options, take exactly from XML
        currentPriceUsd = markPrice;
        if (currency !== 'USD') {
          currentPriceUsd = currentPriceUsd * (currencies[currency] || 1);
        }
      } else {
        // For stocks, fetch from cache to get LIVE price
        const cachedPrice = await fetchPrice(symbol, currency, 'SMART', 'STK', 0, currencies);
        if (cachedPrice && cachedPrice > 0) {
          currentPriceUsd = cachedPrice;
        } else {
          // Fallback to XML price
          currentPriceUsd = markPrice;
          if (currency !== 'USD') {
            currentPriceUsd = currentPriceUsd * (currencies[currency] || 1);
          }
        }
      }

      const valueUsd = currentPriceUsd * qty * multiplierNum;

      const newAsset = {
        id,
        symbol: symbol,
        name: symbol,
        amount: String(qty),
        avg_cost: String(perShareCost),
        cost_basis_money: String(qty < 0 ? -costBasisUsd : costBasisUsd),
        currency: 'USD',
        current_price: String(currentPriceUsd),
        value: String(valueUsd),
        realized_pnl: '0',
        multiplier: String(multiplierNum),
        source: 'FLEX',
        type: isOption ? 'OPTION' : 'ASSET',
        is_active: true,
      };

      if (!existingMap.has(id)) {
        if (isOption) {
          newAsset.category_id = 'adventure'; // default options category
        }
      }

      await setUserAsset(userId, id, newAsset);
    }

    // Delete stale FLEX assets
    for (const asset of existingAssets) {
      if (asset.source === 'FLEX' && !seenIds.has(asset.id)) {
        logger.info(`[Flex] Deleting stale FLEX asset: ${asset.id}`);
        await deleteUserAsset(userId, asset.id);
      }
    }
  } catch (err) {
    logger.error(`[Flex] Failed to sync ${userId}: ${err.message}`);
  }
}

async function writePortfolioHistory(userId) {
  const assets = await getUserAssets(userId);
  const active = assets.filter((a) => a.is_active !== false);

  const categories = {};
  let totalMarketValue = 0;
  let totalCostBasis = 0;

  for (const asset of active) {
    const catId = asset.category_id || 'other';
    if (!categories[catId]) {
      categories[catId] = { value: 0, type: asset.type || 'ASSET' };
    }
    const price = parseFloat(asset.current_price) || 0;
    const amount = parseFloat(asset.amount) || 0;
    const multiplier = parseFloat(asset.multiplier) || 1;
    // For short positions or cash debt, we must keep amount negative so it subtracts from total market value
    const mv = price * amount * multiplier;
    
    categories[catId].value += mv;
    totalMarketValue += mv;
    totalCostBasis += parseFloat(asset.cost_basis_money) || 0;
  }

  const allocation = Object.entries(categories).map(([catId, cat]) => ({
    category_id: catId,
    name: getCategoryName(catId),
    type: cat.type,
    value: cat.value,
    percentage: totalMarketValue !== 0 ? (cat.value / totalMarketValue) * 100 : 0,
  }));

  const today = new Date().toISOString().slice(0, 10);

  // Import dynamic helper or just write history
  const { setPortfolioHistory } = await import('../services/firebase.js');
  await setPortfolioHistory(userId, today, {
    allocation,
    asset_count: active.length,
    daily_transaction_count: 0,
    date: today,
    timestamp: new Date(),
    total_cost_basis: totalCostBasis,
    total_market_value: totalMarketValue,
  });

  logger.info(`[History] ${userId}: $${totalMarketValue.toFixed(2)} total`);
}

function getCategoryName(catId) {
  const names = {
    growth: 'Growth',
    hedge: 'Defensive',
    adventure: 'Put/Call Sell',
    cash: 'Cash',
    crypto: 'Crypto',
    dividend: 'Dividend',
    other: 'Other',
  };
  return names[catId] || catId;
}
