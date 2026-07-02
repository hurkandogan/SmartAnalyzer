import React, { useState, useEffect } from 'react';

const PortfolioDashboard = () => {
  const [portfolio, setPortfolio] = useState({ positions: [], cash: {}, crypto: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [spyDrop, setSpyDrop] = useState(2); // Slider state (0-50%)

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await fetch('/api/portfolio/all');
        const data = await res.json();
        if (data.success) {
          setPortfolio(data);
        } else {
          setError(data.error || 'Failed to fetch portfolio data');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-12">
        <div className="animate-pulse flex space-x-2 items-center">
          <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
          <div className="w-3 h-3 bg-indigo-500 rounded-full animation-delay-200"></div>
          <div className="w-3 h-3 bg-indigo-500 rounded-full animation-delay-400"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-2xl flex items-center justify-center">
        <p className="font-semibold">⚠️ {error}</p>
      </div>
    );
  }

  let totalTheta = 0;
  let totalBetaDollarDelta = 0; 

  // Filter and enrich positions
  const enrichedPositions = portfolio.positions.map(p => {
    const isOption = p.secType === 'OPT';
    let dte = null;
    let ruleViolations = [];
    
    if (isOption && p.lastTradeDate) {
      const year = parseInt(p.lastTradeDate.substring(0, 4), 10);
      const month = parseInt(p.lastTradeDate.substring(4, 6), 10) - 1;
      const day = parseInt(p.lastTradeDate.substring(6, 8), 10);
      const expiryDate = new Date(year, month, day);
      const diffTime = expiryDate.getTime() - new Date().getTime();
      dte = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // RULE 1: DTE < 21
      if (dte <= 21) {
        ruleViolations.push(`DTE Risk: ${dte} days left`);
      }
      
      // RULE 2: Max Profit > 50%
      if (p.position < 0 && p.currentPrice && p.avgCost) {
        const maxProfit = p.avgCost; 
        const currentProfit = p.avgCost - p.currentPrice;
        const profitPct = (currentProfit / maxProfit) * 100;
        if (profitPct >= 50) {
          ruleViolations.push(`Take Profit: ${profitPct.toFixed(1)}% reached`);
        }
      }
    }

    // Calculations for portfolio-level Greeks
    const multiplier = parseFloat(p.multiplier || '1');
    const positionSize = p.position || 0;
    const price = p.currentPrice || 0;
    const beta = p.beta || 1.0;
    
    if (isOption && p.greeks) {
      // Theta per day = greek * multiplier * pos
      totalTheta += (p.greeks.theta || 0) * multiplier * positionSize;
      
      // Position Delta = greek * multiplier * pos
      const posDelta = (p.greeks.delta || 0) * multiplier * positionSize;
      // Dollar Delta = position delta * current price * beta
      totalBetaDollarDelta += posDelta * price * beta;
    } else if (p.secType === 'STK') {
      // Stock delta is 1
      totalBetaDollarDelta += positionSize * price * beta;
    }

    return { ...p, isOption, dte, ruleViolations };
  }).sort((a, b) => b.isOption - a.isOption); // Options first

  const totalPositions = enrichedPositions.length;
  const netLiquidation = portfolio.cash?.netLiquidation || 0;
  const excessLiquidity = portfolio.cash?.excessLiquidity || 0;
  
  // SPY Stress Test PnL
  const dropPct = spyDrop / 100;
  const spyStressTestPnL = totalBetaDollarDelta * -dropPct;
  const simExcessLiq = excessLiquidity + spyStressTestPnL;
  const isMarginCall = simExcessLiq < 0;

  return (
    <div className="w-full space-y-8 animate-in fade-in zoom-in-95 duration-500">
      
      {/* Slider Controls */}
      <div className="bg-[#0b0c10]/80 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md max-w-2xl mx-auto">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h4 className="text-white/70 font-bold text-sm tracking-widest uppercase">SPY Stress Test</h4>
            <p className="text-white/40 text-xs mt-1">Simulate market crash (SPY Drop %)</p>
          </div>
          <span className="text-3xl font-black text-rose-400">-{spyDrop}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="50" 
          value={spyDrop} 
          onChange={(e) => setSpyDrop(Number(e.target.value))}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-500"
        />
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <p className="text-white/40 font-medium text-sm mb-1 uppercase tracking-wider">Net Liquidity</p>
          <p className="text-3xl font-black text-white">${parseFloat(netLiquidation).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
        <div className={`bg-[#0b0c10] border ${isMarginCall ? 'border-rose-500/50' : 'border-white/10'} rounded-2xl p-6 shadow-2xl relative overflow-hidden group transition-colors duration-500`}>
          <div className={`absolute inset-0 bg-gradient-to-br opacity-20 ${isMarginCall ? 'from-rose-500' : 'from-emerald-500/0'} transition-opacity duration-500`}></div>
          <p className="text-white/40 font-medium text-sm mb-1 uppercase tracking-wider flex justify-between">
            Simulated Excess Liq
            {isMarginCall && <span className="text-rose-400 font-bold text-xs uppercase animate-pulse">⚠️ MARGIN CALL</span>}
          </p>
          <p className={`text-3xl font-black ${isMarginCall ? 'text-rose-400' : 'text-white'}`}>
            ${parseFloat(simExcessLiq).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </p>
        </div>
        <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <p className="text-emerald-400/60 font-medium text-sm mb-1 uppercase tracking-wider">Daily Theta (θ)</p>
          <p className="text-3xl font-black text-emerald-400">${totalTheta.toFixed(2)}</p>
        </div>
        <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <p className="text-rose-400/60 font-medium text-sm mb-1 uppercase tracking-wider">Est. Sim PnL</p>
          <p className={`text-3xl font-black ${spyStressTestPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${spyStressTestPnL.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-[#0b0c10]/50 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="px-6 py-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            Live Portfolio Greeks & Rules
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] text-white/40 text-xs uppercase tracking-wider border-b border-white/10">
                <th className="px-6 py-4 font-medium">Asset</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium text-right">Pos</th>
                <th className="px-6 py-4 font-medium text-right">Price</th>
                <th className="px-6 py-4 font-medium text-right">Greeks (Δ / θ)</th>
                <th className="px-6 py-4 font-medium text-right">DTE</th>
                <th className="px-6 py-4 font-medium">Rule Guard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {enrichedPositions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-white/40">
                    No active positions found.
                  </td>
                </tr>
              ) : (
                enrichedPositions.map((pos, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-base">
                          {pos.symbol}
                        </span>
                        {pos.isOption && (
                          <span className="text-xs text-indigo-400/80 font-mono tracking-wide mt-1">
                            {pos.lastTradeDate} | Strike: {pos.strike}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {pos.isOption ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${pos.right === 'P' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                          {pos.right === 'P' ? 'PUT' : 'CALL'} {pos.position < 0 ? 'SHORT' : 'LONG'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-white/60 border border-white/10">
                          STK
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-mono ${pos.position < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {pos.position}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-white/60 font-mono text-xs mb-1">Avg: {pos.avgCost ? pos.avgCost.toFixed(2) : '-'}</span>
                        <span className="text-white font-mono">{pos.currentPrice ? pos.currentPrice.toFixed(2) : '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {pos.isOption && pos.greeks ? (
                        <div className="flex flex-col items-end">
                          <span className="text-indigo-400 font-mono text-xs mb-1">Δ: {pos.greeks.delta ? pos.greeks.delta.toFixed(3) : '-'}</span>
                          <span className="text-emerald-400 font-mono text-xs">θ: {pos.greeks.theta ? pos.greeks.theta.toFixed(3) : '-'}</span>
                        </div>
                      ) : (
                        <span className="text-white/20">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {pos.isOption && pos.dte !== null ? (
                        <span className={`font-bold ${pos.dte <= 21 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {pos.dte}
                        </span>
                      ) : (
                        <span className="text-white/20">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {pos.ruleViolations.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {pos.ruleViolations.map((v, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/5 text-emerald-500/60 border border-emerald-500/10 whitespace-nowrap">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                          Rules Passed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PortfolioDashboard;
