import { Hono } from 'hono';
import { pythonClient } from '../services/pythonClient.js';
import { logger } from '../utils/logger.js';

export const portfolioRoutes = new Hono();

// Single endpoint — fetches everything from Python
portfolioRoutes.get('/all', async (c) => {
  try {
    const portfolioData = await pythonClient.getPortfolio();
    
    if (!portfolioData || portfolioData.status !== 'success') {
      throw new Error('Failed to fetch portfolio from Python service');
    }

    const { ibkr, kraken } = portfolioData;

    // Normalize IBKR positions slightly to match frontend expectations if necessary
    const mappedPositions = (ibkr.positions || []).map((p) => {
      const contract = p.contract || {};
      const mult = parseFloat(contract.multiplier || '1');
      const avgCost = mult > 1 ? p.avgCost / mult : p.avgCost;

      return {
        symbol: contract.symbol || '',
        secType: contract.secType || '',
        currency: contract.currency || '',
        exchange: contract.exchange || '',
        strike: contract.strike || 0,
        right: contract.right || '',
        lastTradeDate: contract.lastTradeDateOrContractMonth || '',
        position: p.position || 0,
        avgCost,
        currentPrice: p.marketPrice || p.price || null,
        multiplier: contract.multiplier || '1',
        unrealizedPNL: p.unrealizedPNL || 0,
        marketValue: p.marketValue || 0,
        greeks: p.greeks || null,
        beta: p.beta || 1.0
      };
    });

    // Normalize Cash/NetLiquidation
    const cash = ibkr.cash || {};
    const totalCash = cash['USD'] || 0;
    const netLiquidation = cash['NetLiquidation'] || 0;
    const buyingPower = cash['BuyingPower'] || 0;
    const excessLiquidity = cash['ExcessLiquidity'] || 0;

    return c.json({
      success: true,
      connected: ibkr.connected,
      positions: mappedPositions,
      positionCount: mappedPositions.length,
      cash: {
        totalCashValue: totalCash,
        netLiquidation: netLiquidation,
        buyingPower: buyingPower,
        excessLiquidity: excessLiquidity
      },
      crypto: kraken.balances || {}
    });
  } catch (error) {
    logger.error(`Portfolio fetch failed: ${error.message}`);
    return c.json(
      {
        success: false,
        connected: false,
        error: error.message,
        positions: [],
        cash: {},
        crypto: {}
      },
      500,
    );
  }
});

portfolioRoutes.get('/connection', async (c) => {
  try {
    const portfolioData = await pythonClient.getPortfolio();
    return c.json({
      connected: portfolioData?.ibkr?.connected || false,
    });
  } catch (err) {
    return c.json({ connected: false });
  }
});
