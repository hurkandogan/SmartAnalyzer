import { Hono } from 'hono';
import { pythonClient } from '../services/pythonClient.js';
import {
  getWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
} from '../services/firebase.js';
import { logger } from '../utils/logger.js';

export const watchlistRoutes = new Hono();

// GET /api/watchlist — list all items
watchlistRoutes.get('/', async (c) => {
  try {
    const items = await getWatchlist();
    return c.json({ success: true, items });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// POST /api/watchlist — add { symbol }
watchlistRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const symbol = (body.symbol || '').toUpperCase().trim();

  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return c.json({ success: false, error: 'Invalid symbol' }, 400);
  }

  try {
    // Validate via Python — get contract details
    const details = await pythonClient.getContractDetails(symbol, 'STK', 'USD');

    if (!details || details.status === 'error') {
      return c.json(
        { success: false, error: `Symbol "${symbol}" not found via Python Service` },
        404,
      );
    }

    const item = {
      symbol,
      name: details.longName || details.description || symbol,
      industry: details.industry || '',
      category: details.category || '',
      exchange: details.primaryExchange || details.exchange || '',
      currency: details.currency || 'USD',
    };

    await addWatchlistItem(symbol, item);
    logger.info(`Watchlist: added ${symbol}`);
    return c.json({ success: true, item });
  } catch (error) {
    logger.error(`Watchlist add failed for ${symbol}: ${error.message}`);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// DELETE /api/watchlist/:symbol — remove
watchlistRoutes.delete('/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase();
  try {
    await removeWatchlistItem(symbol);
    logger.info(`Watchlist: removed ${symbol}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
