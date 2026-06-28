import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from './config/index.js';
import { initFirebase } from './services/firebase.js';
import { startScheduler } from './jobs/scheduler.js';
import { jobRoutes } from './routes/jobs.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { watchlistRoutes } from './routes/watchlist.js';
import { logger } from './utils/logger.js';
import { pythonClient } from './services/pythonClient.js';

const app = new Hono();

app.use('*', honoLogger());
app.use('/api/*', cors());

app.get('/api', async (c) => {
  const pyStatus = await pythonClient.getStatus();
  return c.json({
    service: 'SmartAnalyser',
    status: 'running',
    uptime: process.uptime(),
    connected: pyStatus.ibkr_connected || false,
  });
});

app.route('/api/jobs', jobRoutes);
app.route('/api/portfolio', portfolioRoutes);
app.route('/api/watchlist', watchlistRoutes);


app.get('/api/ticker-data', async (c) => {
  const symbol = c.req.query('symbol');
  if (!symbol) return c.json({ error: 'Missing symbol' }, 400);
  const data = await pythonClient.getTickerData(symbol);
  if (data?.status === 404) return c.json({ error: 'Not found' }, 404);
  if (data?.status === 500) return c.json({ error: data.error }, 500);
  return c.json(data);
});

app.get('/api/logs', async (c) => {
  const limit = c.req.query('limit') || 50;
  const logs = await pythonClient.getLogs(limit);
  return c.json(logs);
});

// Serve React frontend (built files)
app.use('/*', serveStatic({ root: './client/dist' }));
app.use('/*', serveStatic({ root: './client/dist', path: 'index.html' }));

async function main() {
  try {
    initFirebase();
    startScheduler();

    serve({ fetch: app.fetch, port: config.PORT }, (info) => {
      logger.info(`SmartAnalyser running on http://localhost:${info.port}`);
      logger.info('Endpoints:');
      logger.info('  GET  /                       → health check');
      logger.info('  POST /api/jobs/portfolio-sync → manual portfolio sync');
      logger.info('  POST /api/jobs/stock-analysis → manual stock analysis');
      logger.info('  POST /api/jobs/currency-update→ manual currency update');
      logger.info('  GET  /api/jobs/status         → running jobs');
    });
  } catch (error) {
    logger.error(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

main();
