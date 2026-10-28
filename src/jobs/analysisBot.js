import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { logger, dbLogger } from '../utils/logger.js';
import { getDb } from '../services/firebase.js';
import pkg from 'pg';

const { Pool } = pkg;
const execPromise = util.promisify(exec);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function runAnalysisBot() {
  logger.info('[AnalysisBot] Starting daily analysis jobs...');
  try {
    await dbLogger('analysis-bot', 'info', 'Started analysis jobs');

    const pythonScript = path.resolve(process.cwd(), 'python/jobs/qullamaggie_job.py');
    const pythonEnv = path.resolve(process.cwd(), 'python/.venv/bin/python');
    
    logger.info(`[AnalysisBot] Running Python script: ${pythonScript}`);
    
    const { spawn } = await import('child_process');
    
    await new Promise((resolve, reject) => {
      let pyProcess = spawn(pythonEnv, [pythonScript], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
      
      pyProcess.on('error', (err) => {
        logger.warn(`Failed with venv, trying global python: ${err.message}`);
        pyProcess = spawn('python3', [pythonScript], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });
        setupListeners(pyProcess);
      });
      
      if (pyProcess.pid) {
        setupListeners(pyProcess);
      }
      
      function setupListeners(child) {
        child.stdout.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean);
          for (const line of lines) {
             logger.info(`[Python] ${line}`);
             if (line.includes('Score:') || line.includes('Analyzing')) {
               dbLogger('analysis-bot', 'info', line.trim());
             }
          }
        });

        child.stderr.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean);
          for (const line of lines) {
             logger.info(`[Python] ${line}`);
             if (line.includes('Score:') || line.includes('Analyzing')) {
               const cleanLine = line.replace(/.*\[INFO\] qullamaggie_job:\s*/, '').trim();
               dbLogger('analysis-bot', 'info', cleanLine);
             }
          }
        });

        child.on('close', (code) => {
          if (code !== 0) reject(new Error(`Python script exited with code ${code}`));
          else resolve();
        });
      }
    });
    
    logger.info(`[AnalysisBot] Python Qullamaggie script finished successfully.`);

    // RUN FUNDAMENTALS SCRIPT
    const fundScript = path.resolve(process.cwd(), 'python/jobs/fundamentals_job.py');
    logger.info(`[AnalysisBot] Running Python Fundamentals script: ${fundScript}`);
    
    await new Promise((resolve, reject) => {
      let pyProcess = spawn(pythonEnv, [fundScript], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
      
      pyProcess.on('error', (err) => {
        logger.warn(`Failed with venv, trying global python: ${err.message}`);
        pyProcess = spawn('python3', [fundScript], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });
        setupListeners(pyProcess);
      });
      
      if (pyProcess.pid) {
        setupListeners(pyProcess);
      }
      
      function setupListeners(child) {
        child.stdout.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean);
          for (const line of lines) {
             logger.info(`[Python Fund] ${line}`);
          }
        });
        child.stderr.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean);
          for (const line of lines) {
             logger.info(`[Python Fund] ${line}`);
          }
        });
        child.on('close', (code) => {
          if (code !== 0) reject(new Error(`Python script exited with code ${code}`));
          else resolve();
        });
      }
    });
    logger.info(`[AnalysisBot] Python Fundamentals script finished successfully.`);

    const res = await syncAnalysisToFirebase();
    await dbLogger('analysis-bot', 'success', `Analysis finished. Processed ${res.total} symbols, synced ${res.synced} active analyses.`);
    
  } catch (error) {
    logger.error(`[AnalysisBot] Job failed: ${error.message}`);
    await dbLogger('analysis-bot', 'error', `Job failed: ${error.message}`);
    throw error;
  }
}

export async function syncAnalysisToFirebase() {
  logger.info('[AnalysisBot] Syncing Postgres results to Firebase...');
  const firestore = getDb();
  const { FieldValue } = await import('firebase-admin/firestore');
  const client = await pool.connect();

  const businessDaysBetween = (d1, d2) => {
    const cur = new Date(`${d1}T00:00:00Z`);
    const end = new Date(`${d2}T00:00:00Z`);
    if (end <= cur) return 0;
    let count = 0;
    while (cur < end) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      const day = cur.getUTCDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  };

  const addBusinessDays = (dateStr, numDays) => {
    const cur = new Date(`${dateStr}T00:00:00Z`);
    let added = 0;
    while (added < numDays) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      const day = cur.getUTCDay();
      if (day !== 0 && day !== 6) added++;
    }
    return cur.toISOString().split('T')[0];
  };

  const calendarDaysBetween = (d1, d2) => {
    const t1 = Date.parse(`${d1}T00:00:00Z`);
    const t2 = Date.parse(`${d2}T00:00:00Z`);
    return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
  };

  const pctChange = (curr, prev) => {
    if (!prev || prev <= 0 || curr === null || curr === undefined) return null;
    return Number((((curr - prev) / prev) * 100).toFixed(2));
  };

  try {
    const techRes = await client.query(`
      SELECT symbol, rsi, rs, ema_10, ema_20, sma_50, sma_200, volume, avg_volume, date
      FROM technicals 
      WHERE date >= CURRENT_DATE - INTERVAL '14 days'
      ORDER BY date DESC
    `);

    const scoreRes = await client.query(`
      SELECT symbol, analysis_type, score, status, reason, price, created_at, as_of_date,
             to_char(COALESCE(as_of_date, created_at::date), 'YYYY-MM-DD') as sig_date
      FROM analysis_scores 
      WHERE created_at >= NOW() - INTERVAL '45 days'
      ORDER BY COALESCE(as_of_date, created_at::date) DESC, created_at DESC
    `);

    const fundRes = await client.query(`
      SELECT symbol, pe, peg, date
      FROM fundamentals 
      WHERE date >= CURRENT_DATE - INTERVAL '14 days'
      ORDER BY date DESC
    `);

    // Fetch recent candles (last 45 calendar days = ~30 trading days) for 1D, 1W (5D), 1M (21D) performance
    const candleRes = await client.query(`
      SELECT symbol, to_char(date, 'YYYY-MM-DD') as date, close
      FROM candles
      WHERE date >= CURRENT_DATE - INTERVAL '45 days' AND volume > 0
      ORDER BY symbol, date DESC
    `);

    // Fetch qualifying qullamaggie signals in the last 90 days ordered ASC for wave clustering
    const qullaWavesRes = await client.query(`
      SELECT DISTINCT ON (symbol, COALESCE(as_of_date, created_at::date))
        symbol,
        analysis_type,
        score,
        status,
        reason,
        price,
        created_at,
        as_of_date,
        to_char(COALESCE(as_of_date, created_at::date), 'YYYY-MM-DD') as sig_date
      FROM analysis_scores
      WHERE analysis_type = 'qullamaggie'
        AND status IN ('candidate', 'watch')
        AND score > 0
        AND COALESCE(as_of_date, created_at::date) >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY symbol, COALESCE(as_of_date, created_at::date) ASC, created_at DESC
    `);

    // Fetch up to the last 5 qualifying analysis dates for fundamentals
    const fundHistoryRes = await client.query(`
      SELECT 
        symbol,
        score,
        status,
        to_char(COALESCE(as_of_date, created_at::date), 'YYYY-MM-DD') as date
      FROM (
        SELECT 
          symbol,
          score,
          status,
          as_of_date,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY symbol 
            ORDER BY COALESCE(as_of_date, created_at::date) DESC, created_at DESC
          ) as rn
        FROM analysis_scores
        WHERE analysis_type = 'fundamentals' AND status IN ('pass', 'warn') AND score > 0
      ) sub
      WHERE rn <= 5
      ORDER BY symbol, date DESC;
    `);

    // 1. Build Candles Performance Map (1D, 1W, 1M)
    const candlesBySymbol = new Map();
    for (const r of candleRes.rows) {
      if (!candlesBySymbol.has(r.symbol)) candlesBySymbol.set(r.symbol, []);
      candlesBySymbol.get(r.symbol).push({ date: r.date, close: Number(r.close) });
    }

    const performanceMap = new Map();
    for (const [sym, cList] of candlesBySymbol.entries()) {
      if (cList.length === 0) continue;
      const latestClose = cList[0].close;
      const d1 = cList.length > 1 ? pctChange(latestClose, cList[1].close) : null;
      const w1 =
        cList.length > 5
          ? pctChange(latestClose, cList[5].close)
          : cList.length > 1
            ? pctChange(latestClose, cList[cList.length - 1].close)
            : null;
      const m1 =
        cList.length > 21
          ? pctChange(latestClose, cList[21].close)
          : cList.length > 1
            ? pctChange(latestClose, cList[cList.length - 1].close)
            : null;
      performanceMap.set(sym, {
        d1,
        w1,
        m1,
        latest_price: latestClose,
        latest_date: cList[0].date,
      });
    }

    // 2. Build Technicals & Fundamentals Maps
    const technicalsMap = new Map();
    techRes.rows.forEach((r) => {
      if (!technicalsMap.has(r.symbol)) {
        technicalsMap.set(r.symbol, r);
      }
    });

    const fundamentalsMap = new Map();
    fundRes.rows.forEach((r) => {
      if (!fundamentalsMap.has(r.symbol)) {
        fundamentalsMap.set(r.symbol, r);
      }
    });

    const fundHistoryMap = new Map();
    fundHistoryRes.rows.forEach((r) => {
      if (!fundHistoryMap.has(r.symbol)) fundHistoryMap.set(r.symbol, []);
      fundHistoryMap.get(r.symbol).push({
        date: r.date,
        score: r.score,
        status: r.status,
      });
    });

    const latestScoresMap = new Map();
    let latestGlobalRunDate = new Date().toISOString().split('T')[0];
    let foundMaxDate = null;
    scoreRes.rows.forEach((r) => {
      if (r.analysis_type === 'qullamaggie' && r.sig_date) {
        if (!foundMaxDate || r.sig_date > foundMaxDate) {
          foundMaxDate = r.sig_date;
        }
      }
      if (!latestScoresMap.has(r.symbol)) {
        latestScoresMap.set(r.symbol, {});
      }
      if (!latestScoresMap.get(r.symbol)[r.analysis_type]) {
        latestScoresMap.get(r.symbol)[r.analysis_type] = r;
      }
    });
    if (foundMaxDate) latestGlobalRunDate = foundMaxDate;

    // 3. Cluster Qullamaggie waves per symbol (10 business days cooldown)
    const WAVE_COOLDOWN_DAYS = 10;
    const PAUSE_GRACE_DAYS = 5; // 5 business days before dropping
    const DROPPED_RETENTION_CALENDAR_DAYS = 14; // keep in dropped list for 14 calendar days

    const qullaSignalsBySym = new Map();
    for (const r of qullaWavesRes.rows) {
      if (!qullaSignalsBySym.has(r.symbol)) qullaSignalsBySym.set(r.symbol, []);
      qullaSignalsBySym.get(r.symbol).push(r);
    }

    const latestWaveBySym = new Map();
    for (const [sym, sigs] of qullaSignalsBySym.entries()) {
      let currentWave = [];
      const waves = [];
      for (const sig of sigs) {
        if (currentWave.length === 0) {
          currentWave.push(sig);
        } else {
          const prevDate = currentWave[currentWave.length - 1].sig_date;
          const bDays = businessDaysBetween(prevDate, sig.sig_date);
          if (bDays <= WAVE_COOLDOWN_DAYS) {
            currentWave.push(sig);
          } else {
            waves.push(currentWave);
            currentWave = [sig];
          }
        }
      }
      if (currentWave.length > 0) waves.push(currentWave);

      if (waves.length > 0) {
        const lastWave = waves[waves.length - 1];
        const firstSig = lastWave[0];
        const lastSig = lastWave[lastWave.length - 1];
        const maxScore = Math.max(...lastWave.map((s) => Number(s.score) || 0));
        const initialStatus = firstSig.status;
        const peakStatus = lastWave.some((s) => s.status === 'candidate') ? 'candidate' : 'watch';
        const upgradedToCandidate = initialStatus === 'watch' && peakStatus === 'candidate';
        const firstCandSig = upgradedToCandidate ? lastWave.find((s) => s.status === 'candidate') : null;
        const upgradeDate = firstCandSig ? firstCandSig.sig_date : null;

        const historyDesc = [...lastWave]
          .reverse()
          .slice(0, 5)
          .map((s) => ({
            date: s.sig_date,
            score: Number(s.score) || 0,
            status: s.status,
          }));

        latestWaveBySym.set(sym, {
          wave_number: waves.length,
          wave_start_date: firstSig.sig_date,
          wave_last_date: lastSig.sig_date,
          wave_active_days: lastWave.length,
          wave_max_score: maxScore,
          wave_initial_status: initialStatus,
          wave_peak_status: peakStatus,
          upgraded_to_candidate: upgradedToCandidate,
          upgrade_date: upgradeDate,
          last_qualifying_row: lastSig,
          history: historyDesc,
        });
      }
    }

    const allSymbols = new Set([
      ...technicalsMap.keys(),
      ...latestScoresMap.keys(),
      ...fundamentalsMap.keys(),
      ...latestWaveBySym.keys(),
    ]);

    let syncedAnalysisCount = 0;
    let pausedAnalysisCount = 0;
    const droppedAnalysesList = [];

    let batch = firestore.batch();
    let opCount = 0;

    for (const sym of allSymbols) {
      const docRef = firestore.collection('assets').doc(sym);
      const data = {};

      if (technicalsMap.has(sym)) {
        data.technicals = technicalsMap.get(sym);
      }

      if (fundamentalsMap.has(sym)) {
        data.fundamentals = fundamentalsMap.get(sym);
      }

      const latestScores = latestScoresMap.get(sym) || {};
      const latestQulla = latestScores['qullamaggie'];
      const latestFund = latestScores['fundamentals'];
      const waveInfo = latestWaveBySym.get(sym);
      const perf = performanceMap.get(sym) || { d1: null, w1: null, m1: null, latest_price: null };

      const isTodayQualifying =
        latestQulla &&
        (latestQulla.status === 'candidate' || latestQulla.status === 'watch') &&
        Number(latestQulla.score) > 0 &&
        latestQulla.sig_date === latestGlobalRunDate;

      const missedBusinessDays = waveInfo
        ? businessDaysBetween(waveInfo.wave_last_date, latestGlobalRunDate)
        : 999;

      const isActiveOrPaused =
        waveInfo && (isTodayQualifying || (missedBusinessDays >= 0 && missedBusinessDays <= PAUSE_GRACE_DAYS));

      if (isActiveOrPaused) {
        const lifecycleStatus = isTodayQualifying || missedBusinessDays === 0 ? 'active' : 'paused';
        if (lifecycleStatus === 'paused') pausedAnalysisCount++;
        syncedAnalysisCount++;

        const baseQullaRow = isTodayQualifying ? latestQulla : waveInfo.last_qualifying_row;
        const effectivePrice =
          perf.latest_price ??
          (latestQulla?.price ? Number(latestQulla.price) : Number(baseQullaRow.price) || 0);

        data.analysis = {
          performance: {
            d1: perf.d1,
            w1: perf.w1,
            m1: perf.m1,
          },
          qullamaggie: {
            ...baseQullaRow,
            price: effectivePrice,
            lifecycle_status: lifecycleStatus,
            paused_days: lifecycleStatus === 'paused' ? missedBusinessDays : 0,
            max_pause_days: PAUSE_GRACE_DAYS,
            wave_start_date: waveInfo.wave_start_date,
            wave_last_date: waveInfo.wave_last_date,
            wave_active_days: waveInfo.wave_active_days,
            wave_max_score: waveInfo.wave_max_score,
            wave_initial_status: waveInfo.wave_initial_status,
            wave_peak_status: waveInfo.wave_peak_status,
            upgraded_to_candidate: waveInfo.upgraded_to_candidate,
            upgrade_date: waveInfo.upgrade_date,
            wave_number: waveInfo.wave_number,
            history: waveInfo.history,
            history_dates: waveInfo.history.map((h) => h.date),
            performance: {
              d1: perf.d1,
              w1: perf.w1,
              m1: perf.m1,
            },
          },
        };

        if (data.technicals) {
          data.analysis.qullamaggie.technicals = data.technicals;
        }
        if (data.fundamentals) {
          data.analysis.qullamaggie.fundamentals = data.fundamentals;
        }

        if (latestFund) {
          const fHist = fundHistoryMap.get(sym) || [];
          data.analysis.fundamentals = {
            ...latestFund,
            history: fHist,
            history_dates: fHist.map((h) => h.date),
          };
          if (data.technicals) data.analysis.fundamentals.technicals = data.technicals;
          if (data.fundamentals) data.analysis.fundamentals.fundamentals = data.fundamentals;
        }

        data.analysis.history = {
          qullamaggie: waveInfo.history,
          fundamentals: fundHistoryMap.get(sym) || [],
        };

        data.updated_at = new Date();
        data.analysis_timestamp = new Date();
        batch.set(docRef, data, { merge: true });
      } else {
        // Check if this symbol dropped within the last 14 calendar days
        if (waveInfo && missedBusinessDays > PAUSE_GRACE_DAYS) {
          const droppedDate = addBusinessDays(waveInfo.wave_last_date, PAUSE_GRACE_DAYS + 1);
          const daysSinceDropped = calendarDaysBetween(droppedDate, latestGlobalRunDate);
          if (daysSinceDropped >= 0 && daysSinceDropped <= DROPPED_RETENTION_CALENDAR_DAYS) {
            let fundSector = null;
            try {
              const r =
                typeof latestFund?.reason === 'string'
                  ? JSON.parse(latestFund.reason)
                  : latestFund?.reason;
              fundSector = r?.sector || null;
            } catch {}

            droppedAnalysesList.push({
              symbol: sym,
              wave_start_date: waveInfo.wave_start_date,
              wave_last_date: waveInfo.wave_last_date,
              dropped_date: droppedDate,
              days_since_dropped: daysSinceDropped,
              missed_business_days: missedBusinessDays,
              wave_active_days: waveInfo.wave_active_days,
              peak_status: waveInfo.wave_peak_status,
              max_score: waveInfo.wave_max_score,
              last_score: Number(waveInfo.last_qualifying_row.score) || 0,
              price: perf.latest_price ?? (Number(waveInfo.last_qualifying_row.price) || null),
              sector: fundSector,
              performance: {
                d1: perf.d1,
                w1: perf.w1,
                m1: perf.m1,
              },
            });
          }
        }

        // Remove active analysis from assets/{sym} (preserving notes and other fields via merge)
        batch.set(
          docRef,
          {
            analysis: FieldValue.delete(),
            updated_at: new Date(),
          },
          { merge: true }
        );
      }

      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = firestore.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    // Sort dropped analyses by dropped_date DESC (most recently dropped first)
    droppedAnalysesList.sort((a, b) => b.dropped_date.localeCompare(a.dropped_date));

    // Save dropped analyses (2-week retention) to screener/dropped_analyses in Firebase
    await firestore.collection('screener').doc('dropped_analyses').set({
      items: droppedAnalysesList,
      retention_days: DROPPED_RETENTION_CALENDAR_DAYS,
      pause_grace_business_days: PAUSE_GRACE_DAYS,
      latest_run_date: latestGlobalRunDate,
      updated_at: new Date(),
    });

    logger.info(
      `[AnalysisBot] Processed ${allSymbols.size} symbols. Synced ${syncedAnalysisCount} analyses (${syncedAnalysisCount - pausedAnalysisCount} active, ${pausedAnalysisCount} paused) and ${droppedAnalysesList.length} dropped analyses (14d window) to Firebase.`
    );
    return {
      total: allSymbols.size,
      synced: syncedAnalysisCount,
      paused: pausedAnalysisCount,
      dropped: droppedAnalysesList.length,
    };
  } finally {
    client.release();
  }
}
