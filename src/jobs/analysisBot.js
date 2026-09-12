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
    
    logger.info(`[AnalysisBot] Python script finished successfully.`);

    logger.info('[AnalysisBot] Syncing Postgres results to Firebase...');
    const firestore = getDb();
    const batch = firestore.batch();
    
    const client = await pool.connect();
    
    try {
      const techRes = await client.query(`
        SELECT symbol, rsi, rs, ema_10, ema_20, sma_50, sma_200, volume, avg_volume 
        FROM technicals 
        WHERE date = CURRENT_DATE
      `);
      
      const scoreRes = await client.query(`
        SELECT symbol, analysis_type, score, status, reason, price 
        FROM analysis_scores 
        WHERE created_at >= CURRENT_DATE
      `);
      
      const uyumluRes = await client.query(`
        SELECT DISTINCT symbol 
        FROM analysis_scores 
        WHERE created_at >= CURRENT_DATE - INTERVAL '5 days' 
          AND score >= 50
      `);
      const uyumluSymbols = new Set(uyumluRes.rows.map(r => r.symbol));
      
      const technicalsMap = new Map();
      techRes.rows.forEach(r => technicalsMap.set(r.symbol, r));
      
      const scoresMap = new Map();
      scoreRes.rows.forEach(r => {
        if (!scoresMap.has(r.symbol)) scoresMap.set(r.symbol, {});
        scoresMap.get(r.symbol)[r.analysis_type] = r;
      });
      
      const allSymbols = new Set([...technicalsMap.keys(), ...scoresMap.keys()]);
      
      const { FieldValue } = await import('firebase-admin/firestore');
      const analysisTypes = ['qullamaggie'];
      
      let syncedAnalysisCount = 0;
      
      for (const sym of allSymbols) {
        const docRef = firestore.collection('assets').doc(sym);
        const data = {};
        
        if (technicalsMap.has(sym)) {
          data.technicals = technicalsMap.get(sym);
        }
        
        const currentScores = scoresMap.get(sym) || {};
        data.analysis = {};
        const isUyumlu = uyumluSymbols.has(sym);
        
        if (isUyumlu) {
            syncedAnalysisCount++;
        }
        
        for (const type of analysisTypes) {
          const scoreData = currentScores[type];
          if (isUyumlu && scoreData && scoreData.status !== 'no_setup' && scoreData.score >= 60) {
            data.analysis[type] = scoreData;
          } else {
            data.analysis[type] = FieldValue.delete();
          }
        }
        
        data.updated_at = new Date();
        batch.set(docRef, data, { merge: true });
      }
      
      await batch.commit();
      logger.info(`[AnalysisBot] Processed ${allSymbols.size} symbols. Synced ${syncedAnalysisCount} active analyses to Firebase.`);
      await dbLogger('analysis-bot', 'success', `Analysis finished. Processed ${allSymbols.size} symbols, synced ${syncedAnalysisCount} active analyses.`);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error(`[AnalysisBot] Job failed: ${error.message}`);
    await dbLogger('analysis-bot', 'error', `Job failed: ${error.message}`);
    throw error;
  }
}
