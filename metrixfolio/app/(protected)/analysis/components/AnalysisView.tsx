'use client';

import React, { useState, useMemo } from 'react';
import { FiSearch, FiX, FiFilter, FiTrendingUp, FiActivity, FiRotateCcw } from 'react-icons/fi';

interface AnalysisViewProps {
  initialAssets: any[];
}

export default function AnalysisView({ initialAssets }: AnalysisViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [qullaFilter, setQullaFilter] = useState<'all' | 'candidate' | 'watch' | 'score_90' | 'score_80' | 'score_70'>('all');
  const [fundFilter, setFundFilter] = useState<'all' | 'score_70' | 'score_60' | 'score_50' | 'score_40' | 'wheel_pass' | 'wheel_warn'>('all');
  const [sortBy, setSortBy] = useState<'qulla_score_desc' | 'fund_score_desc' | 'symbol_asc' | 'price_desc'>('qulla_score_desc');

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    return initialAssets.filter((asset) => {
      const qullamaggie = asset.analysis?.qullamaggie;
      const fundamentals = asset.analysis?.fundamentals;

      if (!qullamaggie && !fundamentals) return false;

      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const sym = (asset.symbol || '').toLowerCase();
        
        let fundReasons: any = {};
        try {
          if (fundamentals?.reason) fundReasons = JSON.parse(fundamentals.reason);
        } catch (e) {}
        
        const sector = (fundReasons.sector || '').toLowerCase();
        
        const matchesSymbol = sym.includes(query);
        const matchesSector = sector.includes(query);
        
        if (!matchesSymbol && !matchesSector) {
          return false;
        }
      }

      // 2. Qullamaggie Filter
      if (qullaFilter !== 'all') {
        if (!qullamaggie) return false;

        const qScore = Number(qullamaggie.score) || 0;
        const qStatus = qullamaggie.status;

        if (qullaFilter === 'candidate' && qStatus !== 'candidate') return false;
        if (qullaFilter === 'watch' && qStatus !== 'watch') return false;
        if (qullaFilter === 'score_90' && qScore < 90) return false;
        if (qullaFilter === 'score_80' && qScore < 80) return false;
        if (qullaFilter === 'score_70' && qScore < 70) return false;
      }

      // 3. Fundamentals Filter
      if (fundFilter !== 'all') {
        if (!fundamentals) return false;

        const fScore = Number(fundamentals.score) || 0;
        let fundReasons: any = {};
        try {
          if (fundamentals.reason) fundReasons = JSON.parse(fundamentals.reason);
        } catch (e) {}
        const wheelFit = fundReasons.wheel_fit || fundamentals.status;

        if (fundFilter === 'score_70' && fScore < 70) return false;
        if (fundFilter === 'score_60' && fScore < 60) return false;
        if (fundFilter === 'score_50' && fScore < 50) return false;
        if (fundFilter === 'score_40' && fScore < 40) return false;
        if (fundFilter === 'wheel_pass' && wheelFit !== 'pass') return false;
        if (fundFilter === 'wheel_warn' && wheelFit !== 'warn') return false;
      }

      return true;
    }).sort((a, b) => {
      const qScoreA = Number(a.analysis?.qullamaggie?.score) || 0;
      const qScoreB = Number(b.analysis?.qullamaggie?.score) || 0;
      const fScoreA = Number(a.analysis?.fundamentals?.score) || 0;
      const fScoreB = Number(b.analysis?.fundamentals?.score) || 0;
      const priceA = Number(a.analysis?.qullamaggie?.price ?? a.analysis?.fundamentals?.price ?? 0);
      const priceB = Number(b.analysis?.qullamaggie?.price ?? b.analysis?.fundamentals?.price ?? 0);

      if (sortBy === 'qulla_score_desc') return qScoreB - qScoreA;
      if (sortBy === 'fund_score_desc') return fScoreB - fScoreA;
      if (sortBy === 'symbol_asc') return (a.symbol || '').localeCompare(b.symbol || '');
      if (sortBy === 'price_desc') return priceB - priceA;
      return 0;
    });
  }, [initialAssets, searchQuery, qullaFilter, fundFilter, sortBy]);

  const isFiltered = searchQuery.trim() !== '' || qullaFilter !== 'all' || fundFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setQullaFilter('all');
    setFundFilter('all');
    setSortBy('qulla_score_desc');
  };

  // Quick stats
  const candidateCount = useMemo(() => {
    return initialAssets.filter(a => a.analysis?.qullamaggie?.status === 'candidate').length;
  }, [initialAssets]);

  const watchCount = useMemo(() => {
    return initialAssets.filter(a => a.analysis?.qullamaggie?.status === 'watch').length;
  }, [initialAssets]);

  return (
    <div className="space-y-6">
      {/* ── FILTER CONTROL PANEL ── */}
      <div className="bg-base-200/60 backdrop-blur-md rounded-2xl border border-base-300 p-4 md:p-5 shadow-sm space-y-4">
        
        {/* Top Row: Search Input & Reset */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          
          {/* Search Box */}
          <div className="relative flex-1 max-w-lg">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-base-content/50">
              <FiSearch className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hisse sembolü veya sektör ara (örn: PLTR, CRWD, AMD)..."
              className="input input-bordered w-full pl-10 pr-9 bg-base-100 font-medium text-sm focus:border-primary transition-all rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-base-content/40 hover:text-base-content transition-colors"
                title="Aramayı Temizle"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Counts & Reset */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            <span className="text-xs font-mono opacity-60">
              {filteredAssets.length} / {initialAssets.length} hisse
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn btn-ghost btn-xs gap-1 text-error hover:bg-error/10"
                title="Tüm Filtreleri Sıfırla"
              >
                <FiRotateCcw className="w-3 h-3" /> Sıfırla
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Filter Dropdowns & Pills */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-base-300/60">
          
          {/* Qullamaggie Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
              <FiTrendingUp className="w-3.5 h-3.5 text-success" /> Qullamaggie:
            </span>
            <select
              value={qullaFilter}
              onChange={(e) => setQullaFilter(e.target.value as any)}
              className="select select-sm select-bordered rounded-lg bg-base-100 font-medium text-xs"
            >
              <option value="all">Tümü (Tüm Setup&apos;lar)</option>
              <option value="candidate">🟢 Sadece Candidate ({candidateCount})</option>
              <option value="watch">🟡 Sadece Watch ({watchCount})</option>
              <option value="score_90">⭐ Skor 90+</option>
              <option value="score_80">🔥 Skor 80+</option>
              <option value="score_70">Skor 70+</option>
            </select>
          </div>

          {/* Fundamentals Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
              <FiActivity className="w-3.5 h-3.5 text-info" /> Fundamentals:
            </span>
            <select
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value as any)}
              className="select select-sm select-bordered rounded-lg bg-base-100 font-medium text-xs"
            >
              <option value="all">Tümü (Tüm Skorlar)</option>
              <option value="score_70">Fund Skor 70+</option>
              <option value="score_60">Fund Skor 60+</option>
              <option value="score_50">Fund Skor 50+</option>
              <option value="score_40">Fund Skor 40+</option>
              <option value="wheel_pass">Wheel: Pass (Temiz)</option>
              <option value="wheel_warn">Wheel: Warn (Dikkat)</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
              <FiFilter className="w-3.5 h-3.5" /> Sırala:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="select select-sm select-bordered rounded-lg bg-base-100 font-medium text-xs"
            >
              <option value="qulla_score_desc">Qullamaggie Skoru (Yüksek &rarr; Düşük)</option>
              <option value="fund_score_desc">Temel Skor (Yüksek &rarr; Düşük)</option>
              <option value="symbol_asc">Sembol (A &rarr; Z)</option>
              <option value="price_desc">Fiyat (Yüksek &rarr; Düşük)</option>
            </select>
          </div>

        </div>

      </div>

      {/* ── ASSETS CARD LIST ── */}
      <div className="flex flex-col gap-6">
        {filteredAssets.map((asset) => {
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
            <div key={asset.symbol} className="bg-base-100 rounded-xl border border-base-300 shadow-md p-4 md:p-6 flex flex-col xl:flex-row gap-6 hover:border-primary/30 transition-all">
              
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
                    Son Analiz:<br/>{formattedTime}
                  </div>
                )}

                {asset.technicals && (
                  <div className="mt-auto space-y-1">
                    <p className="text-[10px] font-bold uppercase opacity-50 tracking-wider">Teknikler</p>
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

                        <div className="space-y-2 mb-4 text-xs border-t border-base-200 pt-3">
                          <div className="flex justify-between">
                            <span className="opacity-60">Base (Tight)</span>
                            <span className="font-semibold">{reasons.is_tight ? '✅ Yes' : '❌ No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">Volume (Dry)</span>
                            <span className="font-semibold">{reasons.is_dry ? '✅ Yes' : '❌ No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">RVOL</span>
                            <span className="font-mono">{reasons.rvol !== undefined ? reasons.rvol.toFixed(2) : '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-60">Ext % (EMA10)</span>
                            <span className="font-mono">{reasons.ext_pct !== undefined ? (reasons.ext_pct * 100).toFixed(1) + '%' : '-'}</span>
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
      
      {/* Empty State */}
      {filteredAssets.length === 0 && (
        <div className="alert bg-base-200 border border-base-300 shadow-lg mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            <div>
              <h3 className="font-bold text-base">Eşleşen Hisse Bulunamadı</h3>
              <p className="text-xs opacity-70">
                {isFiltered 
                  ? "Seçtiğiniz arama veya filtre kriterlerine uyan bir hisse bulunamadı. Filtreleri temizleyip tekrar deneyebilirsiniz."
                  : "Sistemde henüz analiz adayı bulunmuyor. Arka plan analiz botunun çalışması bekleniyor."}
              </p>
            </div>
          </div>
          {isFiltered && (
            <button 
              type="button" 
              onClick={resetFilters} 
              className="btn btn-primary btn-sm rounded-xl shrink-0"
            >
              Filtreleri Temizle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
