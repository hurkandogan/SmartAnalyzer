import { setCurrency } from '../services/firebase.js';
import { pythonClient } from '../services/pythonClient.js';
import { logger } from '../utils/logger.js';

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Fetches latest currency rates from Python (Yahoo) and writes them to Firebase.
 */
export async function runCurrencyUpdate() {
  logger.info('── Currency Update started ──');
  try {
    const rates = await pythonClient.getCurrencies();
    if (!rates) throw new Error("Could not fetch currencies from Python.");

    const today = formatDate(new Date());
    const pairs = [];

    for (const [currency, rate] of Object.entries(rates)) {
      if (currency === 'USD') continue;
      
      // USD → X
      pairs.push({
        id: `USD_${currency}`,
        from: 'USD',
        to: currency,
        rate: 1 / rate, // If 1 EUR = 1.08 USD, then 1 USD = 0.92 EUR
        date: today,
        source: 'YAHOO',
      });
      // X → USD
      pairs.push({
        id: `${currency}_USD`,
        from: currency,
        to: 'USD',
        rate: rate,
        date: today,
        source: 'YAHOO',
      });
    }

    for (const pair of pairs) {
      await setCurrency(pair.id, pair);
    }

    logger.info(`── Currency Update done: ${pairs.length} pairs updated ──`);
    return { success: true, count: pairs.length };
  } catch (error) {
    logger.error(`Currency Update failed: ${error.message}`);
    throw error;
  }
}
