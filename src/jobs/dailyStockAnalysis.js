import { pythonClient } from '../services/pythonClient.js';
import {
  getWatchlist,
  addStockAnalysis,
  addWatchlistComment,
  getAllUserIds,
  getUserAssets,
  getUserProfile,
  getUserTelegramConfig
} from '../services/firebase.js';
import { logger } from '../utils/logger.js';

export async function runDailyStockAnalysis(forceRisk = false) {
  logger.info('── Daily Stock Analysis started via local Postgres analysis ──');


  let watchlist = [];
  try {
    watchlist = await getWatchlist();
  } catch (err) {
    logger.warn(`Could not fetch watchlist: ${err.message}`);
  }

  if (watchlist.length === 0) {
    logger.info('Watchlist is empty, nothing to analyse.');
    return { success: true, successCount: 0, failCount: 0, total: 0 };
  }

  let successCount = 0;
  let failCount = 0;

  // ── Step 1: Iterate over watchlist, call analyzeTicker ──
  for (const item of watchlist) {
    const symbol = item.symbol || item.id;
    if (!symbol) continue;

    try {
      logger.info(`[Analysis] Analyzing ${symbol} via local DB...`);
      const syncResult = await pythonClient.analyzeTicker(symbol);
      
      if (syncResult && syncResult.status === 'success') {
        successCount++;
        
        if (syncResult.fundamentals && syncResult.fundamentals.date) {
          await addStockAnalysis(symbol, syncResult.fundamentals.date, syncResult.fundamentals);
          logger.info(`[Analysis] ✓ Saved analytics to Firestore for ${symbol} on date ${syncResult.fundamentals.date}`);
        }
        
        if (syncResult.comments) {
          await addWatchlistComment(symbol, "Metrixfolio_AI_Insight", {
            author_name: "Metrixfolio",
            comment: syncResult.comments,
            created_at: new Date().toISOString()
          });
          logger.info(`[Analysis] ✓ Saved AI insight from Metrixfolio for ${symbol}`);
        }
      } else {
        failCount++;
        logger.warn(`[Analysis] ✗ ${symbol} analysis failed: ${syncResult ? syncResult.message || syncResult.error : 'No response'}`);
      }

    } catch (err) {
      failCount++;
      logger.error(`[Analysis] ✗ Error analyzing ${symbol}: ${err.message}`);
    }

    // Short wait, local DB is fast
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // ── Step 2: Trigger Telegram scan and alerts ──
  try {
    logger.info('[Analysis] Gathering user portfolios for risk analysis...');
    const portfolios = {};
    const userIds = await getAllUserIds();
    
    for (const uId of userIds) {
      const assets = await getUserAssets(uId);
      const profile = await getUserProfile(uId);
      const teleConfig = await getUserTelegramConfig(uId);
      
      let userName = profile?.name || profile?.username || profile?.display_name;
      if (!userName) {
        // Fallback defaults
        userName = uId === 'xZy4l4CANfYxpLRfkCxhvfVOURh2' ? 'Hürkan' : 'Göker';
      }
      
      portfolios[uId] = {
        user_name: userName,
        assets: assets.map(a => ({
          symbol: a.symbol || a.id,
          type: a.type || 'ASSET',
          amount: parseFloat(a.amount) || 0,
          value: parseFloat(a.value) || 0,
          source: a.source || 'MANUAL'
        })),
        telegram_bot_token: teleConfig?.bot_token || null,
        telegram_chat_id: teleConfig?.chat_id || null
      };
    }
    
    const symbols = watchlist.map(item => item.symbol || item.id);
    logger.info('[Analysis] Triggering Telegram Daily Scan and Alerts via Python...');
    const scanRes = await pythonClient.scanAndAlert(symbols, portfolios, forceRisk);
    if (scanRes && scanRes.status === 'success') {
      logger.info(`[Analysis] ✓ Telegram Alerts completed. Selected: ${scanRes.top_symbols_selected.join(', ')}`);
    } else {
      logger.warn('[Analysis] ✗ Telegram scan and alert returned failure');
    }
  } catch (err) {
    logger.error(`[Analysis] ✗ Failed to run Telegram scan and alerts: ${err.message}`);
  }

  logger.info(`── Daily Stock Analysis done: ${successCount} ok, ${failCount} failed ──`);
  return { success: true, successCount, failCount, total: watchlist.length };
}
