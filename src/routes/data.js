import { Hono } from 'hono';
import pkg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const { Pool } = pkg;
const dataRoutes = new Hono();

const pool = new Pool({
  connectionString: config.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metrixfolio',
});

// GET /api/data/:symbol/candles
dataRoutes.get('/:symbol/candles', async (c) => {
  const symbol = c.req.param('symbol');
  if (!symbol) return c.json({ error: 'Missing symbol' }, 400);

  try {
    const result = await pool.query(`
      SELECT date, open, high, low, close, volume, ema_10, ema_20, sma_50, sma_200
      FROM candles
      WHERE symbol = $1
        AND date >= (CURRENT_DATE - INTERVAL '1 year')
      ORDER BY date DESC
    `, [symbol.toUpperCase()]);
    
    return c.json(result.rows);
  } catch (err) {
    logger.error(`[DataRoute] Failed to fetch candles for ${symbol}: ${err.message}`);
    return c.json({ error: 'Failed to fetch candles data' }, 500);
  }
});

// GET /api/data/:symbol/fundamentals
dataRoutes.get('/:symbol/fundamentals', async (c) => {
  const symbol = c.req.param('symbol');
  if (!symbol) return c.json({ error: 'Missing symbol' }, 400);

  try {
    const result = await pool.query(`
      SELECT *
      FROM fundamentals
      WHERE symbol = $1
        AND date >= (CURRENT_DATE - INTERVAL '1 year')
      ORDER BY date DESC
    `, [symbol.toUpperCase()]);
    
    return c.json(result.rows);
  } catch (err) {
    logger.error(`[DataRoute] Failed to fetch fundamentals for ${symbol}: ${err.message}`);
    return c.json({ error: 'Failed to fetch fundamental data' }, 500);
  }
});

export { dataRoutes };
