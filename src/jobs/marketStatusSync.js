import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger, dbLogger } from '../utils/logger.js';
import { getDb, initFirebase } from '../services/firebase.js';

const pythonEnv = path.resolve(process.cwd(), 'python/.venv/bin/python');
const scriptPath = path.resolve(process.cwd(), 'python/jobs/market_status_job.py');
const cacheFilePath = path.resolve(process.cwd(), 'python/logs/latest_market_status.json');

let memoryCache = null;
let inFlightPromise = null;

export function getCachedMarketStatus() {
  if (memoryCache) return memoryCache;
  try {
    if (fs.existsSync(cacheFilePath)) {
      const raw = fs.readFileSync(cacheFilePath, 'utf8');
      memoryCache = JSON.parse(raw);
      return memoryCache;
    }
  } catch (err) {
    logger.warn(`[MarketStatusSync] Failed to read cached market status: ${err.message}`);
  }
  return null;
}

export async function runMarketStatusSync({ syncFirebase = true } = {}) {
  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    const startMs = Date.now();
    logger.info('[MarketStatusSync] Computing live Market Status, Breadth & Options Cockpit...');

    try {
      const stdout = await new Promise((resolve, reject) => {
        let out = '';
        let errOut = '';

        let pyProcess = spawn(pythonEnv, [scriptPath], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        pyProcess.on('error', (err) => {
          logger.warn(`[MarketStatusSync] venv python failed (${err.message}), falling back to python3`);
          pyProcess = spawn('python3', [scriptPath], {
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
          });
          attachHandlers(pyProcess);
        });

        if (pyProcess.pid) {
          attachHandlers(pyProcess);
        }

        function attachHandlers(child) {
          child.stdout.on('data', (chunk) => {
            out += chunk.toString();
          });
          child.stderr.on('data', (chunk) => {
            errOut += chunk.toString();
          });
          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`market_status_job.py exited with code ${code}: ${errOut.slice(-400)}`));
            } else {
              resolve(out);
            }
          });
        }
      });

      const startMarker = '__MARKET_STATUS_JSON_START__';
      const endMarker = '__MARKET_STATUS_JSON_END__';
      const sIdx = stdout.indexOf(startMarker);
      const eIdx = stdout.indexOf(endMarker);

      if (sIdx === -1 || eIdx === -1 || eIdx <= sIdx) {
        throw new Error('Could not parse JSON markers from market_status_job.py output');
      }

      const jsonStr = stdout.slice(sIdx + startMarker.length, eIdx).trim();
      const payload = JSON.parse(jsonStr);

      memoryCache = payload;
      try {
        fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
        fs.writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), 'utf8');
      } catch (fsErr) {
        logger.warn(`[MarketStatusSync] Could not write local cache file: ${fsErr.message}`);
      }

      if (syncFirebase) {
        try {
          let firestore = getDb();
          if (!firestore) {
            initFirebase();
            firestore = getDb();
          }
          if (firestore) {
            await firestore
              .collection('screener')
              .doc('market_status')
              .set({
                ...payload,
                updated_at: new Date(),
              });
            logger.info(
              `[MarketStatusSync] Synced screener/market_status to Firebase (${payload.regime?.overall_light?.toUpperCase()} — Score ${payload.regime?.composite_score})`
            );
          }
        } catch (fbErr) {
          logger.error(`[MarketStatusSync] Firebase sync error: ${fbErr.message}`);
        }
      }

      const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
      await dbLogger(
        'market-status',
        'success',
        `Market Status updated in ${elapsedSec}s — Light: ${payload.regime?.overall_light?.toUpperCase()} (${payload.regime?.composite_score}/100)`
      );

      return payload;
    } catch (err) {
      logger.error(`[MarketStatusSync] Failed: ${err.message}`);
      await dbLogger('market-status', 'error', `Market Status Sync failed: ${err.message}`);
      throw err;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}
