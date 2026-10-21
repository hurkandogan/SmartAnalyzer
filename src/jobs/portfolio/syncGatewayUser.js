import { config } from '../../config/index.js';
import { pythonClient } from '../../services/pythonClient.js';
import { getUserAssets } from '../../services/firebase.js';
import { logger } from '../../utils/logger.js';
import { toUsd } from './currencyHelper.js';
import {
  priceCache,
  fetchEnrich,
  finalizeUserPortfolio,
} from './portfolioCalculator.js';

/**
 * Syncs Hurkan's portfolio via local IBKR Gateway + Manual Assets,
 * outputting the exact same unified schema and 3-currency summary as Flex Query users.
 */
export async function syncGatewayUser(rates) {
  const userId = config.FIREBASE_USER_ID;
  logger.info(`[GatewaySync] Syncing private user ${userId} via IBKR Gateway`);

  const existingAssets = await getUserAssets(userId);
  const existingMap = new Map(existingAssets.map((a) => [a.id, a]));

  const portfolioData = await pythonClient.getPortfolio();
  if (!portfolioData || portfolioData.status !== 'success') {
    logger.warn('[GatewaySync] Python portfolio endpoint unavailable. Refreshing existing & manual assets only.');
    await finalizeUserPortfolio({
      userId,
      brokerPositions: [],
      ibkrSummaryRaw: null,
      openOptionsList: [],
      sourceLabel: 'IBKR TWS',
      rates,
      shouldPruneBrokerAssets: false,
    });
    return;
  }

  const { ibkr } = portfolioData;
  const ibkrConnected = Boolean(ibkr?.connected && ibkr.positions !== null && ibkr.cash !== null);

  if (!ibkrConnected) {
    logger.warn('[GatewaySync] IBKR Gateway not connected. Preserving existing broker positions and updating summary.');
    await finalizeUserPortfolio({
      userId,
      brokerPositions: [],
      ibkrSummaryRaw: null,
      openOptionsList: [],
      sourceLabel: 'IBKR TWS',
      rates,
      shouldPruneBrokerAssets: false,
    });
    return;
  }

  const brokerPositions = [];
  const openOptionsList = [];
  const ibkrPositions = ibkr.positions || [];

  for (const pos of ibkrPositions) {
    const { contract, position: qty, avgCost } = pos;
    if (!contract || !qty || Number(qty) === 0) continue;

    const numQty = Number(qty);
    const isOption = contract.secType === 'OPT';
    const localSymbol = (contract.symbol || '').replace(/\s+/g, '');
    const id = isOption ? `IBKR_${localSymbol}_OPT_${contract.conId}` : `IBKR_${localSymbol}`;

    const contractCurrency = contract.currency || 'USD';
    const multiplierNum = parseFloat(contract.multiplier || '1') || 1;

    // Extract per-share average cost in contract's native currency
    const rawPerShareAvgCost = isOption ? Number(avgCost) / multiplierNum : Number(avgCost);
    const perShareAvgCostUsd = toUsd(rawPerShareAvgCost, contractCurrency, rates);
    const costBasisUsd = perShareAvgCostUsd * Math.abs(numQty) * multiplierNum;

    let currentPriceUsd = perShareAvgCostUsd;
    if (pos.marketPrice !== null && pos.marketPrice !== undefined && !isNaN(pos.marketPrice)) {
      currentPriceUsd = toUsd(pos.marketPrice, contractCurrency, rates);
    }

    let marketValueUsd;
    if (pos.marketValue !== null && pos.marketValue !== undefined && !isNaN(pos.marketValue)) {
      marketValueUsd = toUsd(pos.marketValue, contractCurrency, rates);
    } else {
      marketValueUsd = currentPriceUsd * numQty * multiplierNum;
    }

    let unrealizedPnlUsd;
    if (pos.unrealizedPNL !== null && pos.unrealizedPNL !== undefined && !isNaN(pos.unrealizedPNL)) {
      unrealizedPnlUsd = toUsd(pos.unrealizedPNL, contractCurrency, rates);
    } else {
      unrealizedPnlUsd = (currentPriceUsd - perShareAvgCostUsd) * numQty * multiplierNum;
    }

    // Populate shared priceCache for stocks so Flex Query users can use live IBKR stock prices
    if (!isOption && contract.symbol && currentPriceUsd > 0) {
      priceCache.set(`${contract.symbol}_STK`, currentPriceUsd);
      priceCache.set(contract.symbol, currentPriceUsd);
    }

    if (isOption) {
      openOptionsList.push({
        symbol: contract.symbol,
        strike: contract.strike,
        right: contract.right,
        expiry: contract.lastTradeDateOrContractMonth,
        qty: numQty,
        perShareAvgCost: perShareAvgCostUsd,
        currentPrice: currentPriceUsd,
        greeks: pos.greeks,
        iv_rank: pos.iv_rank || null,
        earnings_date: pos.earnings_date || null,
      });
    }

    const existing = existingMap.get(id);
    let sector = existing?.sector || null;
    let industry = existing?.industry || null;

    if (contract.symbol === 'SXRV' || contract.symbol === 'SXRV.DE') {
      sector = 'Technology';
      industry = 'Technology ETF';
    } else if (!isOption && (!sector || !industry || sector === 'Unknown')) {
      const enrichData = await fetchEnrich(
        contract.symbol,
        contractCurrency,
        contract.exchange || 'SMART',
        contract.secType || 'STK'
      );
      if (enrichData) {
        sector = enrichData.sector;
        industry = enrichData.industry;
      }
    }

    let optionName = `${contract.symbol} Option`;
    if (contract.strike && contract.right) {
      optionName = `${contract.symbol} ${contract.strike} ${contract.right} ${contract.lastTradeDateOrContractMonth || ''}`.trim();
    }

    brokerPositions.push({
      id,
      symbol: contract.symbol,
      name: isOption ? optionName : existing?.name || contract.symbol,
      amount: numQty,
      multiplier: multiplierNum,
      type: isOption ? 'OPTION' : 'ASSET',
      source: 'IBKR',
      category_id: existing?.category_id,
      original_currency: contractCurrency,
      original_avg_cost: rawPerShareAvgCost,
      avg_cost_usd: perShareAvgCostUsd,
      current_price_usd: currentPriceUsd,
      cost_basis_usd: numQty < 0 ? -costBasisUsd : costBasisUsd,
      market_value_usd: marketValueUsd,
      unrealized_pnl_usd: unrealizedPnlUsd,
      strike: isOption ? String(contract.strike || '0') : null,
      right: isOption ? contract.right : null,
      expiry: isOption ? contract.lastTradeDateOrContractMonth : null,
      sector,
      industry,
    });
  }

  // IBKR Cash & Account Summary
  const cashBalances = ibkr.cash || {};
  const ibkrSummaryRaw = {
    netLiquidation: cashBalances.NetLiquidation || 0,
    buyingPower: cashBalances.BuyingPower || 0,
    excessLiquidity: cashBalances.ExcessLiquidity || 0,
    maintenanceMargin: cashBalances.MaintMarginReq || 0,
    initialMargin: cashBalances.InitMarginReq || 0,
    totalCashValue: cashBalances.TotalCashValue || 0,
  };

  let totalCashUsd = 0;
  if (typeof cashBalances.TotalCashValue === 'number' && !isNaN(cashBalances.TotalCashValue)) {
    totalCashUsd = cashBalances.TotalCashValue;
  } else {
    for (const [currency, balance] of Object.entries(cashBalances)) {
      if (
        [
          'NetLiquidation',
          'BuyingPower',
          'ExcessLiquidity',
          'MaintMarginReq',
          'InitMarginReq',
          'TotalCashValue',
        ].includes(currency)
      ) {
        continue;
      }
      totalCashUsd += toUsd(balance, currency, rates);
    }
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

  await finalizeUserPortfolio({
    userId,
    brokerPositions,
    ibkrSummaryRaw,
    openOptionsList,
    sourceLabel: 'IBKR TWS',
    rates,
    shouldPruneBrokerAssets: true,
  });

  logger.info(
    `[GatewaySync] Completed for ${userId}: ${brokerPositions.length} broker positions (Cash=$${totalCashUsd.toFixed(2)})`
  );
}
