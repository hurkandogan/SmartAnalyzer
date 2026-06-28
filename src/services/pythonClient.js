import { logger } from '../utils/logger.js';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

class PythonClientService {
  async getPortfolio() {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/portfolio`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.ok ? await res.json() : null;
      return data;
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch portfolio: ${err.message}`);
      return null;
    }
  }

  async getContractDetails(symbol, secType = 'STK', currency = 'USD') {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/contract-details?symbol=${encodeURIComponent(symbol)}&sec_type=${encodeURIComponent(secType)}&currency=${encodeURIComponent(currency)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch contract details for ${symbol}: ${err.message}`);
      return null;
    }
  }

  async getPrice(symbol, currency = 'USD', exchange = 'SMART', secType = 'STK', conId = 0) {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/price?symbol=${encodeURIComponent(symbol)}&currency=${encodeURIComponent(currency)}&exchange=${encodeURIComponent(exchange)}&sec_type=${encodeURIComponent(secType)}&con_id=${encodeURIComponent(conId)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch price for ${symbol}: ${err.message}`);
      return null;
    }
  }

  async analyzeWatchlist(symbols, cachedCandles = {}) {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, cached_candles: cachedCandles })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to analyze watchlist: ${err.message}`);
      return null;
    }
  }

  async dailySync(symbol) {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/daily-sync?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to run daily sync for ${symbol}: ${err.message}`);
      return null;
    }
  }

  async postLog(level, source, message, details = null) {
    try {
      const payload = { level, source, message };
      if (details) payload.details = typeof details === 'string' ? details : JSON.stringify(details);
      
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to post log: ${err.message}`);
      return null;
    }
  }

  async mineTicker(symbol) {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/mine-ticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to mine ticker ${symbol}: ${err.message}`);
      return null;
    }
  }

  async getCurrencies(targets = 'EUR,TRY,GBP,CHF') {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/currencies?targets=${encodeURIComponent(targets)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch currencies: ${err.message}`);
      return null;
    }
  }

  async getStatus() {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/status`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch status: ${err.message}`);
      return { status: 'error', ibkr_connected: false };
    }
  }

  async getTickerData(symbol) {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/ticker-data?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) {
        if (res.status === 404) return { status: 404, message: 'Not found' };
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch ticker data for ${symbol}: ${err.message}`);
      return { status: 500, error: err.message };
    }
  }

  async getLogs(limit = 50) {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/api/logs?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error(`[PythonClient] Failed to fetch logs: ${err.message}`);
      return [];
    }
  }
}

export const pythonClient = new PythonClientService();
