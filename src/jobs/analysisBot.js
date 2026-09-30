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

    logger.info('[AnalysisBot] Syncing Postgres results to Firebase...');
    const firestore = getDb();
    const batch = firestore.batch();
    
    const client = await pool.connect();
    
    try {
      const techRes = await client.query(`
        SELECT symbol, rsi, rs, ema_10, ema_20, sma_50, sma_200, volume, avg_volume, date
        FROM technicals 
        WHERE date >= CURRENT_DATE - INTERVAL '5 days'
        ORDER BY date DESC
      `);
      
      const scoreRes = await client.query(`
        SELECT symbol, analysis_type, score, status, reason, price, created_at 
        FROM analysis_scores 
        WHERE created_at >= NOW() - INTERVAL '5 days'
        ORDER BY created_at DESC
      `);
      
      const technicalsMap = new Map();
      techRes.rows.forEach(r => {
        // Since we order by date DESC, the first one we see is the latest
        if (!technicalsMap.has(r.symbol)) {
            technicalsMap.set(r.symbol, r);
        }
      });
      
      const scoresMap = new Map();
      const latestScoresMap = new Map();
      
      scoreRes.rows.forEach(r => {
        if (!scoresMap.has(r.symbol)) {
            scoresMap.set(r.symbol, []);
            latestScoresMap.set(r.symbol, {});
        }
        
        // Add to historical list for the 5-day check
        scoresMap.get(r.symbol).push(r);
        
        // Store latest score for the UI
        if (!latestScoresMap.get(r.symbol)[r.analysis_type]) {
            latestScoresMap.get(r.symbol)[r.analysis_type] = r;
        }
      });
      
      const allSymbols = new Set([...technicalsMap.keys(), ...scoresMap.keys()]);
      
      const { FieldValue } = await import('firebase-admin/firestore');
      const analysisTypes = ['qullamaggie', 'fundamentals'];
      
      let syncedAnalysisCount = 0;
      
      for (const sym of allSymbols) {
        const docRef = firestore.collection('assets').doc(sym);
        const data = {};
        
        if (technicalsMap.has(sym)) {
          data.technicals = technicalsMap.get(sym);
        }
        
        const currentScores = scoresMap.get(sym) || [];
        const latestScores = latestScoresMap.get(sym) || {};
        data.analysis = {};
        
        // Check if ANY score in the last 5 days passed the threshold
        let anyPassedInLast5Days = false;
        
        for (const r of currentScores) {
            if (r.analysis_type === 'qullamaggie' && r.score >= 70 && r.status !== 'no_setup') {
                anyPassedInLast5Days = true;
                break;
            }
            if (r.analysis_type === 'fundamentals' && r.score >= 70) {
                anyPassedInLast5Days = true;
                break;
            }
        }
        
        if (anyPassedInLast5Days) {
            syncedAnalysisCount++;
            for (const type of analysisTypes) {
                if (latestScores[type]) {
                    data.analysis[type] = latestScores[type];
                }
            }
        } else {
            // Delete old analyses if it didn't pass in the last 5 days
            for (const type of analysisTypes) {
                data.analysis[type] = FieldValue.delete();
            }
        }
        
        data.updated_at = new Date();
        data.analysis_timestamp = new Date(); // Explicitly add this for UI to use easily if needed
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
