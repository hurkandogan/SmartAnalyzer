import { Hono } from 'hono';
import pkg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const { Pool } = pkg;
const analysisRoutes = new Hono();

// Re-use connection from config or instantiate a new pool
const pool = new Pool({
  connectionString: config.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metrixfolio',
});

analysisRoutes.get('/', async (c) => {
  try {
    const result = await pool.query(`
      SELECT symbol, analysis_type, score, status, reason, price, created_at 
      FROM analysis_scores 
      ORDER BY symbol ASC, created_at DESC
    `);
    
    const formattedRows = result.rows.map(row => ({
      symbol: row.symbol,
      analysis_type: row.analysis_type,
      score: row.score,
      status: row.status,
      reason: typeof row.reason === 'string' ? JSON.parse(row.reason) : row.reason,
      price: row.price,
      created_at: row.created_at ? row.created_at.toISOString() : null
    }));

    return c.json(formattedRows);
  } catch (err) {
    logger.error(`[AnalysisRoute] Failed to fetch raw analysis scores: ${err.message}`);
    return c.json({ error: 'Failed to fetch analysis scores' }, 500);
  }
});

export { analysisRoutes };
