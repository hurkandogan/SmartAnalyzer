import { pythonClient } from '../../services/pythonClient.js';
import { getDb } from '../../services/firebase.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_RATES_TO_USD = {
  USD: 1.0,
  EUR: 1.08,
  TRY: 0.0292,
  GBP: 1.29,
  CHF: 1.13,
  CAD: 0.73,
};

function roundNum(val, decimals = 2) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Fetches currency rates (1 unit of currency -> USD) from Python service,
 * falling back to Firestore 'currencies' collection and safe defaults.
 */
export async function fetchExchangeRates() {
  const rates = { ...DEFAULT_RATES_TO_USD };

  // 1. Try Firestore cached rates first as baseline fallback
  try {
    const db = getDb();
    if (db) {
      const snap = await db.collection('currencies').get();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (d.from && d.to === 'USD' && Number(d.rate) > 0) {
          rates[d.from] = Number(d.rate);
        }
      }
    }
  } catch (err) {
    logger.warn(`[CurrencyHelper] Failed reading Firestore currencies: ${err.message}`);
  }

  // 2. Fetch live rates from Python service
  try {
    const liveRates = await pythonClient.getCurrencies('EUR,TRY,GBP,CHF,CAD');
    if (liveRates && typeof liveRates === 'object') {
      for (const [ccy, rate] of Object.entries(liveRates)) {
        if (Number(rate) > 0) {
          rates[ccy] = Number(rate);
        }
      }
    }
  } catch (err) {
    logger.warn(`[CurrencyHelper] Live currency fetch failed, using fallback rates: ${err.message}`);
  }

  rates.USD = 1.0;
  return rates;
}

/**
 * Converts an amount from `fromCurrency` to USD.
 */
export function toUsd(amount, fromCurrency = 'USD', rates = DEFAULT_RATES_TO_USD) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  const ccy = (fromCurrency || 'USD').toUpperCase();
  if (ccy === 'USD') return num;
  const rateToUsd = rates[ccy] || DEFAULT_RATES_TO_USD[ccy] || 1.0;
  return num * rateToUsd;
}

/**
 * Converts an amount from USD to `toCurrency`.
 */
export function fromUsd(amountUsd, toCurrency = 'USD', rates = DEFAULT_RATES_TO_USD) {
  const num = Number(amountUsd);
  if (!Number.isFinite(num)) return 0;
  const ccy = (toCurrency || 'USD').toUpperCase();
  if (ccy === 'USD') return num;
  const rateToUsd = rates[ccy] || DEFAULT_RATES_TO_USD[ccy] || 1.0;
  return rateToUsd > 0 ? num / rateToUsd : num;
}

/**
 * Builds a pre-calculated 3-currency object { USD, EUR, TRY } from a USD amount.
 */
export function toMultiCurrency(amountUsd, rates = DEFAULT_RATES_TO_USD, decimals = 2) {
  const safeUsd = Number.isFinite(Number(amountUsd)) ? Number(amountUsd) : 0;
  return {
    USD: roundNum(safeUsd, decimals),
    EUR: roundNum(fromUsd(safeUsd, 'EUR', rates), decimals),
    TRY: roundNum(fromUsd(safeUsd, 'TRY', rates), decimals),
  };
}
