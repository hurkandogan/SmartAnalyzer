import { Hono } from 'hono';
import { pythonClient } from '../services/pythonClient.js';
import { logger } from '../utils/logger.js';

export const screenerRoutes = new Hono();

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

screenerRoutes.get('/universe', async (c) => {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/api/screener/universe`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    logger.error(`[Screener] Failed to fetch universe: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

screenerRoutes.post('/universe', async (c) => {
  try {
    const body = await c.req.json();
    const res = await fetch(`${PYTHON_SERVICE_URL}/api/screener/universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    logger.error(`[Screener] Failed to add to universe: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

screenerRoutes.delete('/universe/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol');
    const res = await fetch(`${PYTHON_SERVICE_URL}/api/screener/universe/${symbol}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    logger.error(`[Screener] Failed to delete from universe: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

screenerRoutes.post('/sync', async (c) => {
  try {
    const chunk_size = c.req.query('chunk_size') || 50;
    const res = await fetch(`${PYTHON_SERVICE_URL}/api/screener/sync?chunk_size=${chunk_size}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    logger.error(`[Screener] Failed to start sync: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

screenerRoutes.get('/opportunities', async (c) => {
  try {
    const min_score = c.req.query('min_score') || 75;
    const res = await fetch(`${PYTHON_SERVICE_URL}/api/screener/opportunities?min_score=${min_score}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    logger.error(`[Screener] Failed to fetch opportunities: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

screenerRoutes.get('/heatmap', async (c) => {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/api/screener/heatmap`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return c.json(data);
  } catch (err) {
    logger.error(`[Screener] Failed to fetch heatmap: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

import { getFirestore } from 'firebase-admin/firestore';

screenerRoutes.post('/push-firebase', async (c) => {
  try {
    const body = await c.req.json();
    // body: { type: 'opportunities' | 'heatmap', data: any }
    const db = getFirestore();
    
    if (body.type === 'opportunities') {
      await db.collection('screener').doc('opportunities').set({
        items: body.data,
        updatedAt: new Date().toISOString()
      });
    } else if (body.type === 'heatmap') {
      await db.collection('screener').doc('heatmap').set({
        tree: body.data,
        updatedAt: new Date().toISOString()
      });
    } else {
      return c.json({ error: 'Invalid type' }, 400);
    }
    
    logger.info(`[Screener] Successfully pushed ${body.type} to Firebase.`);
    return c.json({ status: 'success' });
  } catch (err) {
    logger.error(`[Screener] Failed to push to Firebase: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});

