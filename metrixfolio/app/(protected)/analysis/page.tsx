import React from 'react';
import { getAnalysisCandidatesAction } from '@/actions/analysis';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage() {
  const assets = await getAnalysisCandidatesAction();

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-[1600px] mb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
          Analysis Candidates
        </h1>
        <p className="opacity-70 max-w-3xl mb-4">
          Stocks that have been analyzed by the system and match our trading setups.
        </p>
        
        {/* Bot Schedule Info */}
        <div className="flex flex-wrap gap-2 text-xs opacity-60 font-mono">
          <div className="bg-base-200 px-3 py-1.5 rounded-lg border border-base-300">
            🤖 <span className="font-bold">Data Miner:</span> 03:00 (Mon-Fri)
          </div>
          <div className="bg-base-200 px-3 py-1.5 rounded-lg border border-base-300">
            ⚙️ <span className="font-bold">Analysis Bot:</span> 14:00 (Mon-Fri)
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {assets.map((asset) => {
          const qullamaggie = asset.analysis?.qullamaggie;
          const fundamentals = asset.analysis?.fundamentals;

          if (!qullamaggie && !fundamentals) return null;

          // Format timestamp if exists
          let formattedTime = "";
          if (asset.analysis_timestamp) {
            try {
              const dt = new Date(asset.analysis_timestamp._seconds ? asset.analysis_timestamp._seconds * 1000 : asset.analysis_timestamp);
              formattedTime = dt.toLocaleString('en-GB', { 
                  day: 'numeric', month: 'short', year: 'numeric', 
                  hour: '2-digit', minute: '2-digit' 
              });
            } catch(e) {}
          } else if (asset.updated_at) {
              try {
                  const dt = new Date(asset.updated_at._seconds ? asset.updated_at._seconds * 1000 : asset.updated_at);
                  formattedTime = dt.toLocaleString('en-GB', { 
                      day: 'numeric', month: 'short', year: 'numeric', 
                      hour: '2-digit', minute: '2-digit' 
                  });
              } catch(e) {}
          }

          return (
            <div key={asset.symbol} className="bg-base-100 rounded-xl border border-base-300 shadow-md p-4 md:p-6 flex flex-col xl:flex-row gap-6">
              
              {/* Left Column: Ticker & Info */}
              <div className="xl:w-64 shrink-0 flex flex-col justify-center border-b xl:border-b-0 xl:border-r border-base-200 pb-4 xl:pb-0 pr-0 xl:pr-6">
                <h2 className="text-4xl font-black mb-1">{asset.symbol}</h2>
                
                {(qullamaggie?.price !== undefined || fundamentals?.price !== undefined) && (
                  <div className="text-xl font-bold mb-2">
                    ${Number(qullamaggie?.price ?? fundamentals?.price ?? 0).toFixed(2)}
                  </div>
                )}
                
                {formattedTime && (
                  <div className="text-xs opacity-50 font-mono mb-4">
                    Last Analyzed:<br/>{formattedTime}
                  </div>
                )}

                {asset.technicals && (
                  <div className="mt-auto space-y-1">
                    <p className="text-[10px] font-bold uppercase opacity-50 tracking-wider">Technicals</p>
                    <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                      <span className="bg-base-200 px-1.5 py-0.5 rounded">EMA10: {asset.technicals.ema_10?.toFixed(2)}</span>
                      <span className="bg-base-200 px-1.5 py-0.5 rounded">EMA20: {asset.technicals.ema_20?.toFixed(2)}</span>
                      <span className="bg-base-200 px-1.5 py-0.5 rounded">SMA50: {asset.technicals.sma_50?.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Analysis Cards Container */}
              <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-x-auto pb-2">
                
                {/* Leg A: Qullamaggie Card */}
                {qullamaggie && (() => {
                  const isCandidate = qullamaggie.status === 'candidate';
                  const isWatch = qullamaggie.status === 'watch';
                  
                  let cardStyle = 'border-base-300';
                  let badgeStyle = 'badge-ghost';
                  
                  if (isCandidate) {
                    cardStyle = 'border-success/30 shadow-success/10 bg-success/5';
                    badgeStyle = 'badge-success text-success-content';
                  } else if (isWatch) {
                    cardStyle = 'border-warning/30 shadow-warning/10 bg-warning/5';
                    badgeStyle = 'badge-warning text-warning-content';
                  } else {
                    cardStyle = 'border-base-300 bg-base-100/50 opacity-50';
                  }

                  let reasons: any = {};
                  try {
                    if (qullamaggie.reason) reasons = JSON.parse(qullamaggie.reason);
                  } catch(e) {}

                  return (
                    <div className={`card border min-w-[300px] flex-1 ${cardStyle}`}>
                      <div className="card-body p-4">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-black text-lg opacity-80">QULLAMAGGIE</h3>
                          <div className={`badge ${badgeStyle} uppercase font-bold text-[10px] tracking-wider`}>
                            {qullamaggie.status.replace('_', ' ')}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-base-100 rounded p-1 text-center shadow-sm">
                            <div className="text-[9px] uppercase font-bold opacity-60">Trend</div>
                            <div className="font-mono font-bold text-sm">{reasons.trend_score || 0}</div>
                          </div>
                          <div className="bg-base-100 rounded p-1 text-center shadow-sm">
                            <div className="text-[9px] uppercase font-bold opacity-60">RS</div>
                            <div className="font-mono font-bold text-sm">{reasons.rs_score || 0}</div>
                          </div>
                          <div className="bg-base-100 rounded p-1 text-center shadow-sm">
                            <div className="text-[9px] uppercase font-bold opacity-60">Base</div>
                            <div className="font-mono font-bold text-sm">{reasons.tightness_score || 0}</div>
                          </div>
                          <div className="bg-base-100 rounded p-1 text-center shadow-sm">
                            <div className="text-[9px] uppercase font-bold opacity-60">Dry</div>
                            <div className="font-mono font-bold text-sm">{reasons.vol_score || 0}</div>
                          </div>
                        </div>

                        <div className="mt-auto flex justify-between items-center text-sm font-medium">
                          <span className="opacity-70">Total Score</span>
                          <span className="font-black text-xl">{qullamaggie.score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Leg B: Fundamentals Card */}
                {fundamentals && (() => {
                  let reasons: any = {};
                  try {
                    if (fundamentals.reason) reasons = JSON.parse(fundamentals.reason);
                  } catch(e) {}

                  const wheelFit = reasons.wheel_fit || 'N/A';
                  let wheelBadge = 'badge-outline border-base-300 opacity-50';
                  if (wheelFit === 'pass') wheelBadge = 'badge-outline badge-success text-success';
                  if (wheelFit === 'warn') wheelBadge = 'badge-outline badge-warning text-warning';
                  if (wheelFit === 'fail') wheelBadge = 'badge-outline badge-error text-error';

                  return (
                    <div className="card border border-info/20 shadow-info/5 bg-info/5 min-w-[300px] flex-1">
                      <div className="card-body p-4">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-black text-lg opacity-80 text-info">FUNDAMENTALS</h3>
                          <div className={`badge ${wheelBadge} uppercase font-bold text-[10px] tracking-wider`} title="Wheel Fit (CSP/CC)">
                            WHEEL: {wheelFit}
                          </div>
                        </div>

                        <div className="space-y-2 mb-4 text-xs">
                          <div className="flex justify-between">
                            <span className="opacity-60">Sector / Size</span>
                            <span className="font-semibold text-right">{reasons.sector || 'N/A'} <br/><span className="opacity-70">{reasons.market_cap_bucket || ''}</span></span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">Market Cap</span>
                            <span className="font-mono">{reasons.market_cap ? `$${(reasons.market_cap / 1e9).toFixed(2)}B` : 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">P/E | PEG</span>
                            <span className="font-mono text-right">
                              {reasons.pe_ratio ? reasons.pe_ratio.toFixed(1) : '-'} | {reasons.peg_ratio ? reasons.peg_ratio.toFixed(2) : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">Rev Growth (YoY)</span>
                            <span className="font-mono">{(reasons.revenue_growth * 100)?.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">Net Margin</span>
                            <span className="font-mono">{(reasons.net_margin * 100)?.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">Net Cash Position</span>
                            <span className="font-semibold">{reasons.has_net_cash ? '✅ Positive' : '❌ Debt'}</span>
                          </div>
                        </div>

                        <div className="mt-auto flex justify-between items-center text-sm font-medium pt-2 border-t border-base-200">
                          <span className="opacity-70">Fund Score</span>
                          <span className="font-black text-xl text-info">{fundamentals.score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          );
        })}
      </div>
      
      {assets.length === 0 && (
        <div className="alert alert-info shadow-lg mt-8">
          <span>No analysis candidates found. The background analysis job might be running or no stocks matched the criteria.</span>
        </div>
      )}
    </div>
  );
}
