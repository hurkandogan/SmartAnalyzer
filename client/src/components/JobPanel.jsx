import React, { useState } from 'react';
import { Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../utils';

const JOBS = [
  {
    id: 'portfolio-sync',
    name: 'Portfolio Sync',
    desc: 'IBKR + Kraken → Firebase',
    icon: '📊',
    color: 'from-blue-500 to-cyan-400'
  },
  {
    id: 'data-miner',
    name: 'Data Miner',
    desc: 'Watchlist → Daily Candles & Fundamentals',
    icon: '⛏️',
    color: 'from-amber-500 to-orange-400'
  },

  {
    id: 'currency-update',
    name: 'Currency Update',
    desc: 'Exchange rates → Firebase',
    icon: '💱',
    color: 'from-purple-500 to-pink-400'
  },
  {
    id: 'screener-sync',
    name: 'Screener Sync',
    desc: 'Universe → Background sync',
    icon: '🚀',
    color: 'from-fuchsia-500 to-rose-400'
  },
];

export default function JobPanel() {
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState({});

  async function runJob(jobId) {
    setRunning((prev) => ({ ...prev, [jobId]: true }));
    setStatus((prev) => ({ ...prev, [jobId]: null }));

    try {
      let endpoint = `/api/jobs/${jobId}`;
      if (jobId === 'data-miner') endpoint = '/api/jobs/data-miner';
      else if (jobId === 'screener-sync') endpoint = '/api/screener/sync?chunk_size=50';
      
      const res = await fetch(endpoint, { method: 'POST' });
      
      if (jobId === 'screener-sync') {
        setStatus((prev) => ({
          ...prev,
          [jobId]: res.ok ? { type: 'success', msg: 'Started' } : { type: 'error', msg: 'Failed' }
        }));
        return;
      }

      const data = await res.json();
      setStatus((prev) => ({
        ...prev,
        [jobId]: data.success
          ? { type: 'success', msg: `Done in ${data.duration}` }
          : { type: 'error', msg: data.error },
      }));
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        [jobId]: { type: 'error', msg: err.message },
      }));
    } finally {
      setRunning((prev) => ({ ...prev, [jobId]: false }));
    }
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <h3 className="text-xs font-bold text-white/50 tracking-widest mb-1 ml-1">MANUAL TRIGGERS</h3>
      <div className="flex flex-col gap-2">
        {JOBS.map((job) => (
          <div key={job.id} className="relative group rounded-xl overflow-hidden bg-base-300/30 border border-white/5 backdrop-blur-sm p-3 hover:bg-base-300 transition-colors flex flex-col gap-2">
            <div className={cn("absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-10 bg-gradient-to-br", job.color)} />
            
            <div className="relative z-10 flex items-center gap-3">
              <div className="text-2xl">{job.icon}</div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white truncate">{job.name}</h4>
                <p className="text-[10px] text-white/40 truncate">{job.desc}</p>
              </div>
              <button
                onClick={() => runJob(job.id)}
                disabled={running[job.id]}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {running[job.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
            </div>
            
            {status[job.id] && (
              <div className={cn(
                "flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded w-full relative z-10",
                status[job.id].type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              )}>
                {status[job.id].type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
                <span className="truncate">{status[job.id].msg}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
