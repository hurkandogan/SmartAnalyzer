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
    id: 'stock-analysis',
    name: 'Stock Analysis',
    desc: 'Watchlist → Firebase stocks',
    icon: '📈',
    color: 'from-emerald-500 to-green-400'
  },
  {
    id: 'currency-update',
    name: 'Currency Update',
    desc: 'Exchange rates → Firebase',
    icon: '💱',
    color: 'from-purple-500 to-pink-400'
  },
];

export default function JobPanel() {
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState({});

  async function runJob(jobId) {
    setRunning((prev) => ({ ...prev, [jobId]: true }));
    setStatus((prev) => ({ ...prev, [jobId]: null }));

    try {
      // We map data-miner to the backend API if we need to
      const endpoint = jobId === 'data-miner' ? '/api/jobs/data-miner' : `/api/jobs/${jobId}`;
      const res = await fetch(endpoint, { method: 'POST' });
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
    <div className="w-full max-w-5xl mx-auto">
      <h3 className="text-sm font-bold text-white/50 tracking-widest mb-4 ml-2">MANUAL TRIGGERS</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {JOBS.map((job) => (
          <div key={job.id} className="relative group rounded-2xl overflow-hidden bg-base-300/50 border border-white/5 backdrop-blur-sm p-5 hover:bg-base-300 transition-colors">
            {/* Background Gradient Blob */}
            <div className={cn("absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-10 bg-gradient-to-br", job.color)} />
            
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="text-3xl">{job.icon}</div>
                <button
                  onClick={() => runJob(job.id)}
                  disabled={running[job.id]}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {running[job.id] ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                </button>
              </div>
              
              <h4 className="text-lg font-bold text-white mb-1">{job.name}</h4>
              <p className="text-xs text-white/40 mb-4 flex-1">{job.desc}</p>
              
              <div className="h-6 flex items-center">
                {status[job.id] && (
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md bg-black/30 w-full",
                    status[job.id].type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {status[job.id].type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{status[job.id].msg}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
