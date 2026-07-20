'use client';

import { useEffect, useState } from 'react';
import { getSwingSignalsAction } from '@/actions/screener';

interface SwingSignal {
  symbol: string;
  date: string;
  type: string;
  action: string;
  message: string;
  score: number;
  rsi: number;
  price: number;
}

export default function SwingSignals() {
  const [signals, setSignals] = useState<SwingSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSignals() {
      try {
        const data = await getSwingSignalsAction();
        if (data && data.signals && Array.isArray(data.signals)) {
          setSignals(data.signals);
        }
      } catch (err) {
        console.error('Failed to fetch swing signals:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSignals();
  }, []);

  if (loading) {
    return (
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl p-6 mt-6 animate-pulse">
        <div className="h-6 w-48 bg-base-300 rounded mb-4"></div>
        <div className="h-16 w-full bg-base-300 rounded"></div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl p-6 mt-6 text-center">
        <span className="text-3xl mb-2">😴</span>
        <h2 className="text-lg font-bold">No Active Swing Setups</h2>
        <p className="text-sm opacity-70">Market conditions currently do not meet the strict technical and fundamental criteria.</p>
      </div>
    );
  }

  return (
    <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🎯</span>
        <h2 className="text-lg font-bold">Active Swing Setups</h2>
        <span className="badge badge-primary badge-sm ml-2">{signals.length} Fırsat</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {signals.map((sig, idx) => (
          <div key={idx} className="bg-base-200/50 rounded-xl p-4 border border-base-content/5 hover:border-primary/30 transition-colors flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{sig.symbol}</span>
                <span className={`badge badge-sm font-bold ${sig.action === 'STRONG BUY' ? 'badge-success' : sig.action === 'BUY' ? 'badge-info' : 'badge-error'}`}>
                  {sig.action}
                </span>
              </div>
              <span className="text-xs opacity-60 font-mono">${sig.price.toFixed(2)}</span>
            </div>
            
            <p className="text-xs opacity-80 leading-snug h-8 overflow-hidden text-ellipsis">
              {sig.message}
            </p>
            
            <div className="flex items-center gap-4 mt-2">
              <div className="flex flex-col">
                <span className="text-[10px] opacity-60 uppercase">Fund. Score</span>
                <span className="font-bold font-mono text-sm">{sig.score}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] opacity-60 uppercase">RSI (14)</span>
                <span className={`font-bold font-mono text-sm ${sig.rsi < 30 ? 'text-success' : sig.rsi > 70 ? 'text-error' : ''}`}>{sig.rsi.toFixed(1)}</span>
              </div>
              <div className="flex flex-col ml-auto text-right">
                <span className="text-[10px] opacity-60 uppercase">Setup Type</span>
                <span className="font-bold font-mono text-sm text-primary">{sig.type}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
