'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { db } from '@/utils/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { FiTrendingDown, FiClock, FiActivity, FiZap } from 'react-icons/fi';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

interface IvCrushSignal {
  symbol: string;
  market_price: number | null;
  earnings_date: string | null;
  days_to_earnings: number | null;
  iv_rank: number | null;
  iv_percentile: number | null;
  opportunities: any[]; // Put/Call list
  updated_at?: any;
}

export default function IvCrushRadar() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<IvCrushSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      if (!user) return;
      try {
        const q = query(
          collection(db, 'iv_crush_opportunities')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => d.data() as IvCrushSignal);
        // Sort by IV Rank descending
        data.sort((a, b) => (b.iv_rank || 0) - (a.iv_rank || 0));
        setSignals(data);
      } catch (err) {
        console.error('Failed to fetch IV crush signals:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSignals();
  }, [user]);

  if (loading) {
    return <div className="skeleton h-96 w-full opacity-50 rounded-2xl"></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent drop-shadow-sm flex items-center gap-3">
          <span className="text-accent text-3xl">⚡</span> IV Crush Radar
        </h2>
        <p className="text-base-content/70">
          Discover high-probability option selling opportunities capitalizing on Volatility Crush before earnings.
        </p>
      </div>

      {signals.length === 0 ? (
        <div className="card bg-base-100/50 backdrop-blur-md border border-base-content/10 p-12 text-center shadow-xl">
          <div className="text-5xl mb-4 opacity-50">🧭</div>
          <h3 className="text-xl font-bold mb-2">No Active Opportunities</h3>
          <p className="text-base-content/60 max-w-md mx-auto">
            The scanner did not find any symbols with high Implied Volatility (IV Rank &gt; 50) and upcoming earnings in the next 10 days.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {signals.map((signal) => (
            <div 
              key={signal.symbol} 
              className="card bg-base-100/60 backdrop-blur-xl border border-white/5 shadow-2xl overflow-hidden hover:border-accent/30 transition-all duration-300 hover:shadow-accent/10"
            >
              {/* Header Gradient Strip */}
              <div className="h-1 w-full bg-gradient-to-r from-accent via-primary to-secondary"></div>
              
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight drop-shadow-md">
                      {signal.symbol}
                    </h3>
                    <div className="text-sm font-medium opacity-80 mt-1 flex items-center gap-2">
                      <span className="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-md">
                        {signal.market_price ? usdFormatter.format(signal.market_price) : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Earnings Badge */}
                  <div className="flex flex-col items-end">
                    <div className={`badge badge-lg border-none shadow-inner font-bold ${
                      signal.days_to_earnings !== null && signal.days_to_earnings <= 3 
                        ? 'bg-error text-error-content' 
                        : 'bg-warning text-warning-content'
                    }`}>
                      <FiClock className="mr-1.5" /> 
                      {signal.days_to_earnings === 0 ? 'TODAY' : `${signal.days_to_earnings} Days`}
                    </div>
                    <span className="text-xs opacity-50 mt-1 font-medium tracking-wide uppercase">
                      {signal.earnings_date}
                    </span>
                  </div>
                </div>

                {/* IV Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-base-200/50 rounded-xl p-4 border border-white/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="text-xs font-bold opacity-60 mb-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <FiActivity /> IV Rank
                    </div>
                    <div className="text-3xl font-black text-accent drop-shadow-md">
                      {signal.iv_rank ? signal.iv_rank.toFixed(0) : '-'}%
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-base-300 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="bg-accent h-full shadow-[0_0_8px_rgba(var(--color-accent),0.8)]" 
                        style={{ width: `${Math.min(100, Math.max(0, signal.iv_rank || 0))}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="bg-base-200/50 rounded-xl p-4 border border-white/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="text-xs font-bold opacity-60 mb-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <FiTrendingDown /> IV Percentile
                    </div>
                    <div className="text-3xl font-black text-primary drop-shadow-md">
                      {signal.iv_percentile ? (signal.iv_percentile * 100).toFixed(0) : '-'}%
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-base-300 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="bg-primary h-full shadow-[0_0_8px_rgba(var(--color-primary),0.8)]" 
                        style={{ width: `${Math.min(100, Math.max(0, (signal.iv_percentile || 0) * 100))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Option Opportunities */}
                {signal.opportunities && signal.opportunities.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold opacity-70 uppercase tracking-widest flex items-center gap-2">
                      <FiZap className="text-warning" /> Suggested Strategies
                    </h4>
                    <div className="space-y-2">
                      {signal.opportunities.map((opp, idx) => {
                        const isPut = opp.right === 'P';
                        const isCall = opp.right === 'C';
                        return (
                          <div key={idx} className="flex items-center justify-between bg-base-200/30 hover:bg-base-200/60 transition-colors p-3 rounded-xl border border-white/5">
                            <div className="flex items-center gap-3">
                              <span className={`badge badge-sm font-bold border-none shadow-sm ${isPut ? 'bg-secondary text-secondary-content' : 'bg-info text-info-content'}`}>
                                {isPut ? 'SELL PUT' : 'SELL CALL'}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-bold font-mono text-sm">Strike ${opp.strike}</span>
                                <span className="text-[10px] opacity-60">{opp.expiration}</span>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end">
                              <span className="font-black text-lg text-success drop-shadow-sm">
                                {usdFormatter.format(opp.price)}
                              </span>
                              {opp.delta !== undefined && (
                                <span className="text-[10px] font-mono opacity-60">
                                  Δ: {opp.delta.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
