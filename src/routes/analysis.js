import { Hono } from 'hono';
import pkg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getDb } from '../services/firebase.js';

const { Pool } = pkg;
const analysisRoutes = new Hono();
const HURKAN_UID = 'xZy4l4CANfYxpLRfkCxhvfVOURh2';

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
    
    const formattedRows = result.rows.map(row => {
      let parsedReason = row.reason;
      if (typeof row.reason === 'string') {
        try {
          parsedReason = JSON.parse(row.reason);
        } catch (e) {
          logger.warn(`Failed to parse reason for symbol ${row.symbol}: ${e.message}`);
        }
      }
      return {
        symbol: row.symbol,
        analysis_type: row.analysis_type,
        score: row.score,
        status: row.status,
        reason: parsedReason,
        price: row.price,
        created_at: row.created_at ? row.created_at.toISOString() : null
      };
    });

    return c.json(formattedRows);
  } catch (err) {
    logger.error(`[AnalysisRoute] Failed to fetch raw analysis scores: ${err.message}`);
    return c.json({ error: 'Failed to fetch analysis scores' }, 500);
  }
});

analysisRoutes.get('/performance', async (c) => {
  try {
    const gapDaysParam = parseInt(c.req.query('gap_days') || '10', 10);
    const gapDays = Number.isFinite(gapDaysParam) ? Math.max(1, Math.min(60, gapDaysParam)) : 10;

    // 1. Discover all available analysis types that emit candidate/watch signals
    const typesRes = await pool.query(`
      SELECT DISTINCT analysis_type
      FROM analysis_scores
      WHERE status IN ('candidate', 'watch') AND score > 0
      ORDER BY analysis_type ASC
    `);
    const availableTypes = typesRes.rows.map((r) => r.analysis_type);

    // 2. Fetch distinct daily qualifying signals (candidate / watch with score > 0)
    const sigRes = await pool.query(`
      WITH daily_signals AS (
        SELECT DISTINCT ON (symbol, analysis_type, COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date))
          symbol,
          analysis_type,
          score,
          status,
          reason,
          price,
          COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date)::text AS signal_date
        FROM analysis_scores
        WHERE status IN ('candidate', 'watch')
          AND score > 0
        ORDER BY symbol, analysis_type, COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date),
                 CASE WHEN status = 'candidate' THEN 1 ELSE 2 END,
                 score DESC,
                 created_at DESC
      )
      SELECT * FROM daily_signals
      ORDER BY symbol ASC, analysis_type ASC, signal_date ASC
    `);

    if (sigRes.rows.length === 0) {
      return c.json({
        gap_days: gapDays,
        available_types: availableTypes,
        episodes: [],
      });
    }

    const symbols = [...new Set(sigRes.rows.map((r) => r.symbol))];
    const allDates = sigRes.rows.map((r) => r.signal_date).sort();
    const minSignalDate = allDates[0];
    const minCandleDateObj = new Date(`${minSignalDate}T00:00:00Z`);
    minCandleDateObj.setUTCDate(minCandleDateObj.getUTCDate() - 20);
    const minCandleDate = minCandleDateObj.toISOString().slice(0, 10);

    // 3. Fetch concurrent fundamentals & candles in parallel
    const [fundRes, candleRes] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT ON (symbol, COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date))
          symbol,
          score AS fund_score,
          status AS fund_status,
          reason AS fund_reason,
          COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date)::text AS fund_date
        FROM analysis_scores
        WHERE analysis_type = 'fundamentals'
          AND symbol = ANY($1)
        ORDER BY symbol, COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date), created_at DESC
      `,
        [symbols]
      ),
      pool.query(
        `
        SELECT symbol, date::text AS date, open, high, low, close, volume
        FROM candles
        WHERE symbol = ANY($1)
          AND date >= $2::date
        ORDER BY symbol ASC, date ASC
      `,
        [symbols, minCandleDate]
      ),
    ]);

    // Index fundamentals by symbol (sorted by fund_date asc)
    const fundBySymbol = new Map();
    for (const row of fundRes.rows) {
      let parsedReason = row.fund_reason;
      if (typeof parsedReason === 'string') {
        try {
          parsedReason = JSON.parse(parsedReason);
        } catch {
          parsedReason = {};
        }
      }
      if (!fundBySymbol.has(row.symbol)) fundBySymbol.set(row.symbol, []);
      fundBySymbol.get(row.symbol).push({
        date: row.fund_date,
        score: Number(row.fund_score ?? 0),
        status: row.fund_status || 'unknown',
        reason: parsedReason || {},
      });
    }

    // Index candles by symbol (sorted by date asc)
    const candlesBySymbol = new Map();
    for (const row of candleRes.rows) {
      if (!candlesBySymbol.has(row.symbol)) candlesBySymbol.set(row.symbol, []);
      candlesBySymbol.get(row.symbol).push({
        date: row.date,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || 0),
      });
    }

    // Helper for date difference in calendar days
    const daysBetween = (d1, d2) => {
      const t1 = Date.parse(`${d1}T00:00:00Z`);
      const t2 = Date.parse(`${d2}T00:00:00Z`);
      return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
    };

    // Helper for date difference in business/trading days (Mon-Fri)
    const businessDaysBetween = (d1, d2) => {
      const cur = new Date(`${d1}T00:00:00Z`);
      const end = new Date(`${d2}T00:00:00Z`);
      if (end <= cur) return 0;
      let count = 0;
      while (cur < end) {
        cur.setUTCDate(cur.getUTCDate() + 1);
        const day = cur.getUTCDay();
        if (day !== 0 && day !== 6) {
          count++;
        }
      }
      return count;
    };

    const pctChange = (target, base) => {
      if (!base || base <= 0 || target === null || target === undefined) return null;
      return Number((((target - base) / base) * 100).toFixed(2));
    };

    // 4. Cluster signals into episodes per (symbol, analysis_type)
    const groupedSignals = new Map();
    for (const row of sigRes.rows) {
      const key = `${row.symbol}::${row.analysis_type}`;
      if (!groupedSignals.has(key)) groupedSignals.set(key, []);
      groupedSignals.get(key).push(row);
    }

    const rawEpisodes = [];
    for (const [, sigList] of groupedSignals.entries()) {
      let currentEp = null;
      const symbolEpisodes = [];

      for (const sig of sigList) {
        let parsedReason = sig.reason;
        if (typeof parsedReason === 'string') {
          try {
            parsedReason = JSON.parse(parsedReason);
          } catch {
            parsedReason = {};
          }
        }

        const sigEntry = {
          date: sig.signal_date,
          score: Number(sig.score || 0),
          status: sig.status,
          price: sig.price !== null && sig.price !== undefined ? Number(sig.price) : null,
          reason: parsedReason || {},
        };

        if (!currentEp) {
          currentEp = {
            symbol: sig.symbol,
            analysis_type: sig.analysis_type,
            signals: [sigEntry],
          };
        } else {
          const prevDate = currentEp.signals[currentEp.signals.length - 1].date;
          const diff = businessDaysBetween(prevDate, sigEntry.date);
          if (diff <= gapDays) {
            currentEp.signals.push(sigEntry);
          } else {
            symbolEpisodes.push(currentEp);
            currentEp = {
              symbol: sig.symbol,
              analysis_type: sig.analysis_type,
              signals: [sigEntry],
            };
          }
        }
      }
      if (currentEp) symbolEpisodes.push(currentEp);

      symbolEpisodes.forEach((ep, idx) => {
        ep.episode_number = idx + 1;
        ep.total_episodes_for_symbol = symbolEpisodes.length;
        rawEpisodes.push(ep);
      });
    }

    // 5. Compute forward performance metrics for each episode
    const HORIZONS = [
      { key: '3d', days: 3 },
      { key: '1w', days: 5 },
      { key: '1m', days: 21 },
      { key: '3m', days: 63 },
    ];

    const episodes = rawEpisodes.map((ep) => {
      const firstSig = ep.signals[0];
      const lastSig = ep.signals[ep.signals.length - 1];
      const startDate = firstSig.date;
      const endDate = lastSig.date;

      const scores = ep.signals.map((s) => s.score);
      const initialScore = firstSig.score;
      const maxScore = Math.max(...scores);
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const initialStatus = firstSig.status;
      const hasCandidate = ep.signals.some((s) => s.status === 'candidate');
      const peakStatus = hasCandidate ? 'candidate' : 'watch';
      const upgradedToCandidate = initialStatus === 'watch' && peakStatus === 'candidate';
      const candidateDays = ep.signals.filter((s) => s.status === 'candidate').length;
      const watchDays = ep.signals.filter((s) => s.status === 'watch').length;

      // Match fundamentals on or before startDate
      const fundList = fundBySymbol.get(ep.symbol) || [];
      let matchedFund = null;
      for (const f of fundList) {
        if (f.date <= startDate) matchedFund = f;
        else if (!matchedFund) matchedFund = f;
      }

      const fundStatus = matchedFund ? matchedFund.status : 'unknown';
      const fundScore = matchedFund ? matchedFund.score : null;
      const fundReason = matchedFund?.reason || {};

      // Match candles and determine entry price & forward trading days
      const candles = candlesBySymbol.get(ep.symbol) || [];
      const sameDayIdx = candles.findIndex((c) => c.date === startDate);
      let prevDayIdx = -1;
      for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].date < startDate) {
          prevDayIdx = i;
          break;
        }
      }

      const sigPrice = firstSig.price && firstSig.price > 0 ? firstSig.price : null;
      let entryPrice = sigPrice;
      let baseCandleDate = startDate;
      let forwardStartIdx = -1;

      if (sameDayIdx !== -1 && prevDayIdx !== -1 && sigPrice !== null) {
        const diffSame = Math.abs(candles[sameDayIdx].close - sigPrice);
        const diffPrev = Math.abs(candles[prevDayIdx].close - sigPrice);
        if (diffSame < diffPrev) {
          // Signal was generated after startDate close
          entryPrice = sigPrice;
          baseCandleDate = candles[sameDayIdx].date;
          forwardStartIdx = sameDayIdx + 1;
        } else {
          // Signal was generated pre-market on startDate using prevDay close
          entryPrice = sigPrice;
          baseCandleDate = candles[prevDayIdx].date;
          forwardStartIdx = sameDayIdx;
        }
      } else if (sameDayIdx === -1) {
        // Weekend or today pre-market before candle exists
        if (!entryPrice && prevDayIdx !== -1) {
          entryPrice = candles[prevDayIdx].close;
        }
        baseCandleDate = prevDayIdx !== -1 ? candles[prevDayIdx].date : startDate;
        forwardStartIdx = candles.findIndex((c) => c.date >= startDate);
      } else {
        // prevDayIdx === -1 && sameDayIdx !== -1
        if (!entryPrice) entryPrice = candles[sameDayIdx].close;
        baseCandleDate = candles[sameDayIdx].date;
        forwardStartIdx = sameDayIdx + 1;
      }

      const forwardCandles =
        forwardStartIdx !== -1 && forwardStartIdx < candles.length
          ? candles.slice(forwardStartIdx, forwardStartIdx + 63)
          : [];

      const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
      const latestPrice = latestCandle ? latestCandle.close : entryPrice;
      const tradingDaysElapsed = forwardCandles.length;

      const horizons = {};
      for (const h of HORIZONS) {
        const slice = forwardCandles.slice(0, h.days);
        const completed = forwardCandles.length >= h.days;
        const hasData = slice.length > 0 && entryPrice > 0;
        const closeReturn = completed && hasData ? pctChange(slice[h.days - 1].close, entryPrice) : null;
        const toDateReturn = hasData ? pctChange(slice[slice.length - 1].close, entryPrice) : null;
        const maxGain = hasData ? pctChange(Math.max(...slice.map((c) => c.high)), entryPrice) : null;
        const maxDd = hasData ? pctChange(Math.min(...slice.map((c) => c.low)), entryPrice) : null;

        horizons[h.key] = {
          completed,
          days_available: slice.length,
          target_days: h.days,
          close_return: closeReturn,
          to_date_return: toDateReturn,
          max_gain: maxGain,
          max_dd: maxDd,
        };
      }

      // Overall MFE / MAE across available forward candles (up to 63 trading days)
      let mfe = null;
      let mfeDays = null;
      let mfeDate = null;
      let mae = null;
      let maeDays = null;
      let maeDate = null;

      if (forwardCandles.length > 0 && entryPrice > 0) {
        let bestHigh = -Infinity;
        let worstLow = Infinity;
        forwardCandles.forEach((c, idx) => {
          if (c.high > bestHigh) {
            bestHigh = c.high;
            mfeDays = idx + 1;
            mfeDate = c.date;
          }
          if (c.low < worstLow) {
            worstLow = c.low;
            maeDays = idx + 1;
            maeDate = c.date;
          }
        });
        mfe = pctChange(bestHigh, entryPrice);
        mae = pctChange(worstLow, entryPrice);
      }

      const endTrackingClose =
        forwardCandles.length > 0
          ? forwardCandles[forwardCandles.length - 1].close
          : latestPrice;
      const currentReturn = pctChange(endTrackingClose, entryPrice);

      const forwardCurve =
        entryPrice > 0
          ? forwardCandles.slice(0, 35).map((c, idx) => ({
              day: idx + 1,
              date: c.date,
              close_pct: pctChange(c.close, entryPrice),
              high_pct: pctChange(c.high, entryPrice),
              low_pct: pctChange(c.low, entryPrice),
            }))
          : [];

      return {
        id: `${ep.symbol}-${ep.analysis_type}-${ep.episode_number}-${startDate}`,
        symbol: ep.symbol,
        analysis_type: ep.analysis_type,
        episode_number: ep.episode_number,
        total_episodes_for_symbol: ep.total_episodes_for_symbol,
        start_date: startDate,
        end_date: endDate,
        base_candle_date: baseCandleDate,
        calendar_span_days: daysBetween(startDate, endDate) + 1,
        alert_days: ep.signals.length,
        candidate_days: candidateDays,
        watch_days: watchDays,
        initial_status: initialStatus,
        peak_status: peakStatus,
        upgraded_to_candidate: upgradedToCandidate,
        initial_score: initialScore,
        max_score: maxScore,
        avg_score: avgScore,
        initial_reason: firstSig.reason,
        fund_status: fundStatus,
        fund_score: fundScore,
        sector: fundReason.sector || 'Unknown',
        market_cap_bucket: fundReason.market_cap_bucket || 'Unknown',
        wheel_fit: fundReason.wheel_fit || null,
        has_net_cash: Boolean(fundReason.has_net_cash),
        entry_price: entryPrice ? Number(entryPrice.toFixed(2)) : null,
        latest_price: latestPrice ? Number(latestPrice.toFixed(2)) : null,
        trading_days_elapsed: tradingDaysElapsed,
        horizons,
        mfe,
        mfe_days: mfeDays,
        mfe_date: mfeDate,
        mae,
        mae_days: maeDays,
        mae_date: maeDate,
        current_return: currentReturn,
        signals: ep.signals.map((s) => ({
          date: s.date,
          score: s.score,
          status: s.status,
          price: s.price,
        })),
        forward_curve: forwardCurve,
      };
    });

    // 6. Enrich with Hurkan's personal swing trades & portfolio metrics from Firebase
    let myPortfolioAnalysis = {
      user_uid: HURKAN_UID,
      user_name: 'Hürkan',
      total_portfolio_usd: 0,
      risk_limit_pct: 2,
      max_risk_budget_usd: 0,
      total_open_risk_usd: 0,
      remaining_risk_budget_usd: 0,
      portfolio_risk_pct: 0,
      budget_used_pct: 0,
      total_open_allocated_usd: 0,
      total_realized_pnl_usd: 0,
      total_unrealized_pnl_usd: 0,
      total_combined_pnl_usd: 0,
      total_trades_count: 0,
      open_trades_count: 0,
      closed_trades_count: 0,
      win_count: 0,
      loss_count: 0,
      win_rate_pct: 0,
      positions: [],
      all_transactions: [],
    };

    try {
      const db = getDb();
      if (db) {
        const userRef = db.collection('users').doc(HURKAN_UID);
        const [userSnap, summarySnap, posSnap] = await Promise.all([
          userRef.get(),
          userRef.collection('configuration').doc('portfolio_summary').get(),
          userRef.collection('analysis_positions').get(),
        ]);

        const userData = userSnap.exists ? userSnap.data() : {};
        const summaryData = summarySnap.exists ? summarySnap.data() : {};

        const totalPortfolioUsd = Number(summaryData?.total_value || 0);
        const rawRiskPct = Number(userData?.analysis_risk_limit_pct ?? 2);
        const riskLimitPct = Math.min(10, Math.max(1, Number.isFinite(rawRiskPct) ? rawRiskPct : 2));
        const maxBudgetUsd = Number(((totalPortfolioUsd * riskLimitPct) / 100).toFixed(2));

        // If Hurkan traded any symbol not already in candlesBySymbol, fetch its latest candle price
        const posDocs = posSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const extraSymbols = [
          ...new Set(
            posDocs
              .map((p) => String(p.symbol || '').toUpperCase())
              .filter((sym) => sym && !candlesBySymbol.has(sym))
          ),
        ];

        const extraPriceMap = new Map();
        if (extraSymbols.length > 0) {
          const extraRes = await pool.query(
            `
            SELECT DISTINCT ON (symbol) symbol, close
            FROM candles
            WHERE symbol = ANY($1)
            ORDER BY symbol ASC, date DESC
          `,
            [extraSymbols]
          );
          for (const r of extraRes.rows) {
            extraPriceMap.set(r.symbol, Number(r.close));
          }
        }

        let totalOpenRiskUsd = 0;
        let totalOpenAllocatedUsd = 0;
        let totalRealizedPnlUsd = 0;
        let totalUnrealizedPnlUsd = 0;
        let openCount = 0;
        let closedCount = 0;
        let winCount = 0;
        let lossCount = 0;
        const enrichedPositions = [];
        const allTransactions = [];

        for (const p of posDocs) {
          const sym = String(p.symbol || '').toUpperCase();
          const entryPrice = Number(p.entry_price || 0);
          const stopPrice = Number(p.stop_price || 0);
          const initialShares = Number(p.initial_shares || 0);
          const remainingShares = Number(p.remaining_shares || 0);
          const realizedPnlUsd = Number(p.realized_pnl_usd || 0);
          const status = p.status || 'OPEN';
          const isOpen = status === 'OPEN' && remainingShares > 0;

          const symCandles = candlesBySymbol.get(sym);
          const currentPrice =
            symCandles && symCandles.length > 0
              ? symCandles[symCandles.length - 1].close
              : extraPriceMap.get(sym) ?? entryPrice;

          const unrealizedPnlUsd = isOpen
            ? Number(((currentPrice - entryPrice) * remainingShares).toFixed(2))
            : 0;
          const totalPnlUsd = Number((realizedPnlUsd + unrealizedPnlUsd).toFixed(2));
          const initialCostUsd = Number((entryPrice * initialShares).toFixed(2));
          const currentAllocatedUsd = isOpen
            ? Number((currentPrice * remainingShares).toFixed(2))
            : 0;
          const totalReturnPct =
            initialCostUsd > 0 ? Number(((totalPnlUsd / initialCostUsd) * 100).toFixed(2)) : 0;
          const openRiskUsd = isOpen
            ? Number((Math.max(0, entryPrice - stopPrice) * remainingShares).toFixed(2))
            : 0;

          if (isOpen) {
            openCount++;
            totalOpenRiskUsd += openRiskUsd;
            totalOpenAllocatedUsd += currentAllocatedUsd;
            totalUnrealizedPnlUsd += unrealizedPnlUsd;
          } else {
            closedCount++;
          }
          totalRealizedPnlUsd += realizedPnlUsd;

          if (totalPnlUsd > 0) winCount++;
          else if (totalPnlUsd < 0) lossCount++;

          const txs = Array.isArray(p.transactions) ? p.transactions : [];
          for (const tx of txs) {
            allTransactions.push({
              ...tx,
              symbol: sym,
              position_id: p.id,
              position_status: status,
              entry_price: entryPrice,
            });
          }

          enrichedPositions.push({
            id: p.id,
            symbol: sym,
            status,
            is_open: isOpen,
            entry_price: entryPrice,
            current_price: Number(currentPrice.toFixed(2)),
            stop_price: stopPrice,
            initial_shares: initialShares,
            remaining_shares: remainingShares,
            initial_cost_usd: initialCostUsd,
            current_allocated_usd: currentAllocatedUsd,
            open_risk_usd: openRiskUsd,
            realized_pnl_usd: Number(realizedPnlUsd.toFixed(2)),
            unrealized_pnl_usd: unrealizedPnlUsd,
            total_pnl_usd: totalPnlUsd,
            total_return_pct: totalReturnPct,
            wave_start_date: p.wave_start_date || null,
            opened_at: p.opened_at || null,
            closed_at: p.closed_at || null,
            updated_at: p.updated_at || null,
            transactions: txs,
          });
        }

        enrichedPositions.sort((a, b) =>
          String(b.opened_at || '').localeCompare(String(a.opened_at || ''))
        );
        allTransactions.sort((a, b) =>
          String(b.date || '').localeCompare(String(a.date || ''))
        );

        // Group Hurkan's positions by symbol and attach `my_trade` to matching episodes
        const positionsBySymbol = new Map();
        for (const pos of enrichedPositions) {
          if (!positionsBySymbol.has(pos.symbol)) positionsBySymbol.set(pos.symbol, []);
          positionsBySymbol.get(pos.symbol).push(pos);
        }

        for (const ep of episodes) {
          const symPositions = positionsBySymbol.get(ep.symbol);
          if (!symPositions || symPositions.length === 0) continue;

          // Match wave-specific positions if wave_start_date matches, otherwise attach all symbol positions
          const waveMatched = symPositions.filter(
            (p) => p.wave_start_date && p.wave_start_date === ep.start_date
          );
          const relevantPositions = waveMatched.length > 0 ? waveMatched : symPositions;

          const hasOpen = relevantPositions.some((p) => p.is_open);
          const sumRealized = Number(
            relevantPositions.reduce((s, p) => s + p.realized_pnl_usd, 0).toFixed(2)
          );
          const sumUnrealized = Number(
            relevantPositions.reduce((s, p) => s + p.unrealized_pnl_usd, 0).toFixed(2)
          );
          const sumTotalPnl = Number((sumRealized + sumUnrealized).toFixed(2));
          const sumCost = relevantPositions.reduce((s, p) => s + p.initial_cost_usd, 0);
          const sumReturnPct =
            sumCost > 0 ? Number(((sumTotalPnl / sumCost) * 100).toFixed(2)) : 0;
          const sumOpenRisk = Number(
            relevantPositions.reduce((s, p) => s + p.open_risk_usd, 0).toFixed(2)
          );

          ep.my_trade = {
            has_open: hasOpen,
            positions_count: relevantPositions.length,
            latest_status: relevantPositions[0].status,
            entry_price: relevantPositions[0].entry_price,
            stop_price: relevantPositions[0].stop_price,
            remaining_shares: relevantPositions.reduce((s, p) => s + p.remaining_shares, 0),
            initial_shares: relevantPositions.reduce((s, p) => s + p.initial_shares, 0),
            realized_pnl_usd: sumRealized,
            unrealized_pnl_usd: sumUnrealized,
            total_pnl_usd: sumTotalPnl,
            total_return_pct: sumReturnPct,
            open_risk_usd: sumOpenRisk,
            positions: relevantPositions,
          };
        }

        const totalTradesCount = enrichedPositions.length;
        const winRatePct =
          totalTradesCount > 0 ? Number(((winCount / totalTradesCount) * 100).toFixed(1)) : 0;
        const portfolioRiskPct =
          totalPortfolioUsd > 0
            ? Number(((totalOpenRiskUsd / totalPortfolioUsd) * 100).toFixed(2))
            : 0;
        const budgetUsedPct =
          maxBudgetUsd > 0 ? Number(((totalOpenRiskUsd / maxBudgetUsd) * 100).toFixed(1)) : 0;

        myPortfolioAnalysis = {
          user_uid: HURKAN_UID,
          user_name: userData?.name || 'Hürkan',
          total_portfolio_usd: Number(totalPortfolioUsd.toFixed(2)),
          risk_limit_pct: riskLimitPct,
          max_risk_budget_usd: maxBudgetUsd,
          total_open_risk_usd: Number(totalOpenRiskUsd.toFixed(2)),
          remaining_risk_budget_usd: Number(Math.max(0, maxBudgetUsd - totalOpenRiskUsd).toFixed(2)),
          portfolio_risk_pct: portfolioRiskPct,
          budget_used_pct: budgetUsedPct,
          total_open_allocated_usd: Number(totalOpenAllocatedUsd.toFixed(2)),
          total_realized_pnl_usd: Number(totalRealizedPnlUsd.toFixed(2)),
          total_unrealized_pnl_usd: Number(totalUnrealizedPnlUsd.toFixed(2)),
          total_combined_pnl_usd: Number((totalRealizedPnlUsd + totalUnrealizedPnlUsd).toFixed(2)),
          total_trades_count: totalTradesCount,
          open_trades_count: openCount,
          closed_trades_count: closedCount,
          win_count: winCount,
          loss_count: lossCount,
          win_rate_pct: winRatePct,
          positions: enrichedPositions,
          all_transactions: allTransactions,
        };
      }
    } catch (fbErr) {
      logger.warn(`[AnalysisRoute] Could not enrich with Hurkan's Firebase positions: ${fbErr.message}`);
    }

    // Sort newest start_date first by default
    episodes.sort((a, b) => b.start_date.localeCompare(a.start_date) || b.max_score - a.max_score);

    return c.json({
      gap_days: gapDays,
      available_types: availableTypes,
      total_raw_signals: sigRes.rows.length,
      total_episodes: episodes.length,
      my_portfolio_analysis: myPortfolioAnalysis,
      episodes,
    });
  } catch (err) {
    logger.error(`[AnalysisRoute] Failed to compute analysis performance: ${err.message}`);
    return c.json({ error: 'Failed to compute analysis performance', details: err.message }, 500);
  }
});

analysisRoutes.get('/performance/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  if (!symbol) return c.json({ error: 'Missing symbol' }, 400);
  const sym = symbol.toUpperCase();

  try {
    const [candleRes, sigRes] = await Promise.all([
      pool.query(
        `
        SELECT date::text AS date, open, high, low, close, volume, sma_50, sma_200, ema_10, ema_20
        FROM candles
        WHERE symbol = $1
        ORDER BY date ASC
      `,
        [sym]
      ),
      pool.query(
        `
        SELECT DISTINCT ON (analysis_type, COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date))
          analysis_type,
          score,
          status,
          price,
          reason,
          COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date)::text AS signal_date
        FROM analysis_scores
        WHERE symbol = $1
          AND status IN ('candidate', 'watch')
          AND score > 0
        ORDER BY analysis_type, COALESCE(as_of_date, (created_at AT TIME ZONE 'UTC')::date) ASC,
                 CASE WHEN status = 'candidate' THEN 1 ELSE 2 END,
                 score DESC
      `,
        [sym]
      ),
    ]);

    return c.json({
      symbol: sym,
      candles: candleRes.rows.map((r) => ({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume || 0),
        sma_50: r.sma_50 ? Number(r.sma_50) : null,
        sma_200: r.sma_200 ? Number(r.sma_200) : null,
        ema_10: r.ema_10 ? Number(r.ema_10) : null,
        ema_20: r.ema_20 ? Number(r.ema_20) : null,
      })),
      signals: sigRes.rows.map((r) => ({
        analysis_type: r.analysis_type,
        score: Number(r.score),
        status: r.status,
        price: r.price ? Number(r.price) : null,
        date: r.signal_date,
      })),
    });
  } catch (err) {
    logger.error(`[AnalysisRoute] Failed to fetch chart performance data for ${sym}: ${err.message}`);
    return c.json({ error: 'Failed to fetch symbol performance data' }, 500);
  }
});

analysisRoutes.get('/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  if (!symbol) return c.json({ error: 'Missing symbol' }, 400);

  try {
    const result = await pool.query(`
      SELECT symbol, analysis_type, score, status, reason, price, created_at 
      FROM analysis_scores 
      WHERE symbol = $1
      ORDER BY created_at DESC
    `, [symbol.toUpperCase()]);
    
    const formattedRows = result.rows.map(row => {
      let parsedReason = row.reason;
      if (typeof row.reason === 'string') {
        try {
          parsedReason = JSON.parse(row.reason);
        } catch (e) {
          logger.warn(`Failed to parse reason for symbol ${row.symbol}: ${e.message}`);
        }
      }
      return {
        symbol: row.symbol,
        analysis_type: row.analysis_type,
        score: row.score,
        status: row.status,
        reason: parsedReason,
        price: row.price,
        created_at: row.created_at ? row.created_at.toISOString() : null
      };
    });

    return c.json(formattedRows);
  } catch (err) {
    logger.error(`[AnalysisRoute] Failed to fetch analysis scores for ${symbol}: ${err.message}`);
    return c.json({ error: 'Failed to fetch analysis scores' }, 500);
  }
});

export { analysisRoutes };
