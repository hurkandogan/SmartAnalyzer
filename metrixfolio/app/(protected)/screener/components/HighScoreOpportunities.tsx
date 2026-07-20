'use client';

import { useState, useEffect } from 'react';
import { getOpportunitiesAction, getPricesAction } from '@/actions/screener';
import Link from 'next/link';
import { FiTrendingUp, FiActivity, FiDollarSign, FiBriefcase } from 'react-icons/fi';

export default function HighScoreOpportunities() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [prices, setPrices] = useState<{[sym: string]: number}>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getOpportunitiesAction(75); // Filter > 75
      setOpportunities(data);
      const p = await getPricesAction();
      setPrices(p);
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><span className="loading loading-spinner loading-lg text-primary"></span></div>;
  }

  return (
    <div className="flex flex-col gap-8 w-full mt-10">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🏆</span>
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-success to-emerald-400">High Score Opportunities</h2>
      </div>
      <p className="text-base-content/60 -mt-6">
        Stocks passing hard filters with a fundamental score &ge; 75.
      </p>

      {opportunities.length === 0 ? (
        <div className="alert alert-warning shadow-lg rounded-2xl">
          <span>No opportunities found with a score of 75 or higher. Check back later after background syncs.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {opportunities.map((o) => {
            const isPos1Y = o.performance_1y >= 0;
            const perfColor = isPos1Y ? 'text-success' : 'text-error';

            return (
              <div key={o.symbol} className="bg-base-200/40 border border-base-content/10 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-300 relative overflow-hidden group">
                
                {/* Decorative Background Gradient */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-success/5 rounded-bl-full -z-10 group-hover:bg-success/10 transition-colors"></div>

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span 
                        title={o.long_name || o.symbol}
                        className="text-3xl font-black text-primary cursor-help"
                      >
                        {o.symbol}
                      </span>
                      {prices[o.symbol.toUpperCase()] && (
                        <span className="text-lg font-bold opacity-80 text-base-content/70">
                          ${prices[o.symbol.toUpperCase()].toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-base-content/60 mt-1 font-medium">{o.sector} &bull; {o.industry}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="radial-progress text-success font-black border-4 border-success/10 bg-success/5" 
                         style={{"--value": o.score, "--size": "3.5rem"} as any}>
                      {o.score}
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Valuation */}
                  <div className="bg-base-100/50 rounded-2xl p-4 border border-base-content/5">
                    <div className="flex items-center gap-2 text-base-content/50 mb-2">
                      <FiDollarSign size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">Valuation</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm opacity-80">P/E</span>
                        <span className="text-sm font-bold">{o.pe ? o.pe.toFixed(1) : '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm opacity-80">PEG</span>
                        <span className={`text-sm font-bold ${o.peg && o.peg < 1 ? 'text-success' : ''}`}>
                          {o.peg ? o.peg.toFixed(2) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Profitability */}
                  <div className="bg-base-100/50 rounded-2xl p-4 border border-base-content/5">
                    <div className="flex items-center gap-2 text-base-content/50 mb-2">
                      <FiActivity size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">Profit</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm opacity-80">ROIC</span>
                        <span className={`text-sm font-bold ${o.roic && o.roic > 0.15 ? 'text-success' : ''}`}>
                          {o.roic ? (o.roic * 100).toFixed(1) + '%' : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm opacity-80">FCF</span>
                        <span className="text-sm font-bold">
                          {o.fcf ? '$' + (o.fcf / 1e9).toFixed(1) + 'B' : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Health */}
                  <div className="bg-base-100/50 rounded-2xl p-4 border border-base-content/5">
                    <div className="flex items-center gap-2 text-base-content/50 mb-2">
                      <FiBriefcase size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">Health</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm opacity-80">Debt/EBITDA</span>
                        <span className={`text-sm font-bold ${o.net_debt_to_ebitda && o.net_debt_to_ebitda < 1.5 ? 'text-success' : ''}`}>
                          {o.net_debt_to_ebitda ? o.net_debt_to_ebitda.toFixed(1) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Performance */}
                  <div className="bg-base-100/50 rounded-2xl p-4 border border-base-content/5">
                    <div className="flex items-center gap-2 text-base-content/50 mb-2">
                      <FiTrendingUp size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">1Y Return</span>
                    </div>
                    <div className="flex justify-center items-center h-full pb-2">
                      <span className={`text-xl font-black ${perfColor}`}>
                        {o.performance_1y ? (o.performance_1y * 100).toFixed(1) + '%' : '-'}
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
