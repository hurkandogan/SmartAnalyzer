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
        <p className="opacity-70 max-w-3xl">
          Stocks that have been analyzed by the system and match our trading setups.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {assets.map((asset) => {
          const qullamaggie = asset.analysis?.qullamaggie;
          if (!qullamaggie) return null;

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
            // no_setup, skip or show as grey
            cardStyle = 'border-base-300 bg-base-100/50 opacity-50';
          }

          let reasons: any = {};
          try {
            if (qullamaggie.reason) {
              reasons = JSON.parse(qullamaggie.reason);
            }
          } catch(e) {}

          return (
            <div key={asset.symbol} className={`card border shadow-lg hover:shadow-xl transition-all ${cardStyle}`}>
              <div className="card-body p-5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h2 className="card-title text-2xl font-black">{asset.symbol}</h2>
                    <p className="text-xs font-mono opacity-60">Qullamaggie Score: {qullamaggie.score}</p>
                  </div>
                  <div className={`badge ${badgeStyle} uppercase font-bold text-xs tracking-wider p-3`}>
                    {qullamaggie.status.replace('_', ' ')}
                  </div>
                </div>

                <div className="divider my-1"></div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-base-100 rounded-lg p-2 text-center shadow-inner">
                    <div className="text-[10px] uppercase font-bold opacity-60 mb-1">Trend</div>
                    <div className="font-mono font-bold text-lg">{reasons.trend_score || 0}/30</div>
                  </div>
                  <div className="bg-base-100 rounded-lg p-2 text-center shadow-inner">
                    <div className="text-[10px] uppercase font-bold opacity-60 mb-1">RS</div>
                    <div className="font-mono font-bold text-lg">{reasons.rs_score || 0}/20</div>
                  </div>
                  <div className="bg-base-100 rounded-lg p-2 text-center shadow-inner">
                    <div className="text-[10px] uppercase font-bold opacity-60 mb-1">Base</div>
                    <div className="font-mono font-bold text-lg">{reasons.tightness_score || 0}/20</div>
                  </div>
                  <div className="bg-base-100 rounded-lg p-2 text-center shadow-inner">
                    <div className="text-[10px] uppercase font-bold opacity-60 mb-1">Volume</div>
                    <div className="font-mono font-bold text-lg">{reasons.vol_score || 0}/15</div>
                  </div>
                </div>
                
                {reasons.days_to_earnings !== undefined && (
                  <div className="flex justify-between items-center text-xs opacity-70 bg-base-100 p-2 rounded-lg">
                    <span>Days to Earnings:</span>
                    <span className="font-bold">{reasons.days_to_earnings > 300 ? 'N/A' : reasons.days_to_earnings}</span>
                  </div>
                )}
                
                {asset.technicals && (
                  <div className="mt-4 pt-4 border-t border-base-300">
                    <p className="text-[10px] font-bold uppercase mb-2 opacity-50 tracking-wider">Technicals</p>
                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                      <span className="bg-base-200 px-2 py-1 rounded">EMA10: {asset.technicals.ema_10?.toFixed(2)}</span>
                      <span className="bg-base-200 px-2 py-1 rounded">EMA20: {asset.technicals.ema_20?.toFixed(2)}</span>
                      <span className="bg-base-200 px-2 py-1 rounded">SMA50: {asset.technicals.sma_50?.toFixed(2)}</span>
                      <span className="bg-base-200 px-2 py-1 rounded">SMA200: {asset.technicals.sma_200?.toFixed(2)}</span>
                    </div>
                  </div>
                )}
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
