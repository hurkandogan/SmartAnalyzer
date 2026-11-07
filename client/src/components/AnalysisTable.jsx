import React, { useEffect, useState, useMemo } from 'react';
import MarketStatusCockpit from './MarketStatusCockpit';

function getConvictionBadgeStyle(tier) {
  if (tier === 'A+') {
    return {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
      icon: '🏆',
      label: 'A+ PRIME',
    };
  }
  if (tier === 'A') {
    return {
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      icon: '🔥',
      label: 'A STRONG',
    };
  }
  if (tier === 'B') {
    return {
      badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      icon: '⚡',
      label: 'B SOLID',
    };
  }
  return {
    badge: 'bg-white/5 text-white/45 border-white/10',
    icon: '•',
    label: 'C WATCH',
  };
}

export default function AnalysisTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('status');
  const [convictionFilter, setConvictionFilter] = useState('all'); // 'all' | 'a_plus' | 'a_and_up'
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/analysis');
        if (!res.ok) throw new Error('Failed to fetch analysis data');
        const scores = await res.json();
        setData(scores);
      } catch (e) {
        console.error(e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const strategyRows = useMemo(() => {
    return data
      .filter((item) => {
        if (item.analysis_type !== activeTab) return false;
        if (
          (activeTab === 'qullamaggie' || activeTab === 'early_surf') &&
          (item.status === 'no_setup' ||
            (item.status !== 'candidate' && item.status !== 'watch') ||
            Number(item.score) <= 0)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (activeTab === 'qullamaggie' || activeTab === 'early_surf') {
          const ca = Number(a.conviction_score ?? a.conviction?.score ?? 0);
          const cb = Number(b.conviction_score ?? b.conviction?.score ?? 0);
          if (cb !== ca) return cb - ca;
        }
        return Number(b.score || 0) - Number(a.score || 0);
      });
  }, [data, activeTab]);

  const top3Candidates = useMemo(() => {
    if (activeTab !== 'qullamaggie' && activeTab !== 'early_surf') return [];
    const cands = strategyRows.filter((r) => r.status === 'candidate');
    return (cands.length > 0 ? cands : strategyRows).slice(0, 3);
  }, [strategyRows, activeTab]);

  const filteredData = useMemo(() => {
    return strategyRows.filter((item) => {
      if (searchQuery && !item.symbol.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (activeTab === 'qullamaggie' || activeTab === 'early_surf') {
        const tier = item.conviction_tier || item.conviction?.tier || 'C';
        if (convictionFilter === 'a_plus' && tier !== 'A+') return false;
        if (convictionFilter === 'a_and_up' && tier !== 'A+' && tier !== 'A') return false;
      }
      return true;
    });
  }, [strategyRows, searchQuery, activeTab, convictionFilter]);

  const formatReason = (row) => {
    const reason = row.reason;
    const type = row.analysis_type;
    const conv = row.conviction || reason?.conviction;
    const pillars = conv?.breakdown;

    if (!reason) return '-';

    const renderPillarStrip = () => {
      if (!pillars) return null;
      return (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/5 text-[11px] font-mono">
          <span className="text-amber-300/90 font-semibold">5-Pillar:</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/75 border border-white/10">
            Sector: <b>{pillars.sector?.score ?? 0}</b>/20
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/75 border border-white/10">
            ADR: <b>{pillars.adr?.score ?? 0}</b>/20
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/75 border border-white/10">
            Tight+Vol: <b>{pillars.tight_vol?.score ?? 0}</b>/25
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/75 border border-white/10">
            Stop/R:R: <b>{pillars.risk?.score ?? 0}</b>/20
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/75 border border-white/10">
            Catalyst/RS: <b>{pillars.catalyst?.score ?? 0}</b>/15
          </span>
          {Array.isArray(conv?.tags) &&
            conv.tags.map((t, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-200 border border-amber-500/25 text-[10px]"
              >
                {t}
              </span>
            ))}
        </div>
      );
    };

    if (type === 'qullamaggie') {
      return (
        <div className="flex flex-col">
          <div className="flex flex-wrap gap-2 text-xs">
            {row.sector && <span className="badge badge-sm bg-white/10 text-white/80 border-white/15">{row.sector}</span>}
            <span className="badge badge-sm badge-outline">Trend: {reason.trend_score}</span>
            <span className="badge badge-sm badge-outline">RS: {reason.rs_score}</span>
            <span className="badge badge-sm badge-outline">
              Tight: {reason.tightness_score} ({reason.is_tight ? 'Yes' : 'No'})
            </span>
            <span className="badge badge-sm badge-outline">
              Dry: {reason.vol_score} ({reason.is_dry ? 'Yes' : 'No'})
            </span>
            {reason.rvol && <span className="badge badge-sm badge-outline">RVOL: {Number(reason.rvol).toFixed(2)}</span>}
            {reason.ext_pct !== undefined && (
              <span className="badge badge-sm badge-outline">Ext: {(reason.ext_pct * 100).toFixed(1)}%</span>
            )}
          </div>
          {renderPillarStrip()}
        </div>
      );
    }

    if (type === 'early_surf') {
      const m = reason.metrics || reason || {};
      const b = reason.breakdown || {};
      return (
        <div className="flex flex-col">
          <div className="flex flex-wrap gap-2 text-xs">
            {row.sector && <span className="badge badge-sm bg-white/10 text-white/80 border-white/15">{row.sector}</span>}
            <span className="badge badge-sm badge-outline">
              Pinch: {b.sma50_pinch ?? '-'} ({m.ext_sma50_pct ?? '-'}%)
            </span>
            <span className="badge badge-sm badge-outline">
              Surf: {b.ema_surf ?? '-'} ({m.ema10_gt_20_days ?? 0}d)
            </span>
            <span className="badge badge-sm badge-outline">
              Vol: {b.volume_pocket ?? '-'} (PP:{m.pocket_pivots_10d ?? 0})
            </span>
            <span className="badge badge-sm badge-outline">RSI: {m.rsi ?? m.rsi_14 ?? '-'}</span>
            <span className="badge badge-sm badge-outline">ADR: {m.adr20 ?? m.adr20_pct ?? '-'}%</span>
          </div>
          {renderPillarStrip()}
        </div>
      );
    }

    if (type === 'fundamentals') {
      return (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge badge-sm badge-outline">{row.sector || reason.sector || 'N/A'}</span>
          <span className="badge badge-sm badge-outline">{reason.market_cap_bucket || 'N/A'}</span>
          <span className="badge badge-sm badge-outline">Growth: {(reason.revenue_growth * 100)?.toFixed(1)}%</span>
          <span className="badge badge-sm badge-outline">Margin: {(reason.net_margin * 100)?.toFixed(1)}%</span>
          {reason.pe_ratio && <span className="badge badge-sm badge-outline">P/E: {reason.pe_ratio.toFixed(1)}</span>}
          {reason.peg_ratio && <span className="badge badge-sm badge-outline">PEG: {reason.peg_ratio.toFixed(2)}</span>}
          <span className="badge badge-sm badge-outline">{reason.has_net_cash ? '✅ Net Cash' : '❌ Debt'}</span>
          <span className={`badge badge-sm ${reason.wheel_fit === 'pass' ? 'badge-success' : 'badge-outline'}`}>
            Wheel: {reason.wheel_fit}
          </span>
        </div>
      );
    }

    return JSON.stringify(reason);
  };

  return (
    <div className="w-full flex flex-col mt-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 w-full">
        <h2 className="text-2xl font-bold tracking-tight text-white">Raw Analysis Data &amp; 5-Pillar Conviction Ranker</h2>

        <input
          type="text"
          placeholder="Filter by Ticker..."
          className="input input-bordered w-full md:w-64 bg-[#141416] text-white border-white/10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="tabs tabs-boxed inline-flex p-1 bg-[#141416] border border-white/5">
          <button
            className={`tab ${activeTab === 'status' ? 'bg-emerald-600 text-white font-bold rounded' : 'text-white/60'}`}
            onClick={() => setActiveTab('status')}
          >
            Status
          </button>
          <button
            className={`tab ${activeTab === 'qullamaggie' ? 'bg-indigo-600 text-white font-bold rounded' : 'text-white/60'}`}
            onClick={() => setActiveTab('qullamaggie')}
          >
            Qullamaggie
          </button>
          <button
            className={`tab ${activeTab === 'early_surf' ? 'bg-cyan-600 text-white font-bold rounded' : 'text-white/60'}`}
            onClick={() => setActiveTab('early_surf')}
          >
            Early Surf
          </button>
          <button
            className={`tab ${activeTab === 'fundamentals' ? 'bg-indigo-600 text-white font-bold rounded' : 'text-white/60'}`}
            onClick={() => setActiveTab('fundamentals')}
          >
            Fundamentals
          </button>
        </div>

        {(activeTab === 'qullamaggie' || activeTab === 'early_surf') && (
          <div className="flex items-center gap-1.5 bg-[#141416] p-1 rounded-xl border border-white/10 text-xs">
            {[
              { id: 'all', label: 'All Tiers' },
              { id: 'a_plus', label: '🏆 A+ Prime Only' },
              { id: 'a_and_up', label: '🔥 A+ & A Tiers' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setConvictionFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  convictionFilter === f.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'status' ? (
        <MarketStatusCockpit onNavigateStrategy={setActiveTab} />
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <div className="space-y-5">
          {/* Today's Top 3 Trigger Candidates Spotlight */}
          {(activeTab === 'qullamaggie' || activeTab === 'early_surf') && top3Candidates.length > 0 && (
            <div className="bg-gradient-to-br from-amber-500/[0.08] via-[#141418] to-emerald-500/[0.05] border border-amber-500/25 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
                    Today&apos;s Top 3 Trigger Candidates — 5-Pillar Conviction Ranker
                  </h3>
                </div>
                <span className="text-xs text-white/50">
                  Ranked by Sector Wind (20) • ADR% Fuel (20) • Tightness &amp; Vol Dry-Up (25) • Stop R:R (20) • Catalyst/RS (15)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {top3Candidates.map((item, idx) => {
                  const conv = item.conviction || {};
                  const tier = item.conviction_tier || conv.tier || 'B';
                  const cScore = item.conviction_score ?? conv.score ?? item.score;
                  const style = getConvictionBadgeStyle(tier);
                  const b = conv.breakdown || {};

                  return (
                    <div
                      key={item.symbol}
                      className="bg-black/40 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-amber-400">#{idx + 1}</span>
                            <span className="text-lg font-black text-white">{item.symbol}</span>
                            <span className={`px-2 py-0.5 rounded border text-[11px] font-black font-mono ${style.badge}`}>
                              {style.icon} {tier} • {cScore}
                            </span>
                          </div>
                          <div className="text-[11px] text-white/50 mt-0.5">
                            {item.sector || conv.sector || 'Unknown'}
                            {conv.sector_rank ? ` (Sector Rank #${conv.sector_rank})` : ''}
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <div className="text-sm font-bold text-white">${Number(item.price || 0).toFixed(2)}</div>
                          <div className="text-[10px] text-emerald-300">
                            Stop: ${conv.suggested_stop ?? '—'} ({conv.risk_pct ?? '—'}% risk)
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-5 gap-1 text-[10px] font-mono text-center">
                        <div className="bg-white/5 rounded py-1 border border-white/5">
                          <div className="text-white/40">Sec</div>
                          <div className="text-white font-bold">{b.sector?.score ?? 0}/20</div>
                        </div>
                        <div className="bg-white/5 rounded py-1 border border-white/5">
                          <div className="text-white/40">ADR</div>
                          <div className="text-white font-bold">{b.adr?.score ?? 0}/20</div>
                        </div>
                        <div className="bg-white/5 rounded py-1 border border-white/5">
                          <div className="text-white/40">Tight</div>
                          <div className="text-white font-bold">{b.tight_vol?.score ?? 0}/25</div>
                        </div>
                        <div className="bg-white/5 rounded py-1 border border-white/5">
                          <div className="text-white/40">R:R</div>
                          <div className="text-white font-bold">{b.risk?.score ?? 0}/20</div>
                        </div>
                        <div className="bg-white/5 rounded py-1 border border-white/5">
                          <div className="text-white/40">RS</div>
                          <div className="text-white font-bold">{b.catalyst?.score ?? 0}/15</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-[#141416] rounded-xl border border-white/10 overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              <table className="table table-sm md:table-md w-full text-white/90">
                <thead className="bg-[#1a1a1d] text-white/50 uppercase text-xs tracking-wider border-b border-white/10">
                  <tr>
                    <th>Symbol</th>
                    <th>Conviction</th>
                    <th>Algo Score</th>
                    <th>Status</th>
                    <th>Price &amp; Risk</th>
                    <th>Date</th>
                    <th>Reason &amp; 5-Pillar Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12">
                        <span className="loading loading-spinner text-indigo-500"></span>
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-white/40">
                        No records found for the given criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((row, i) => {
                      const conv = row.conviction || {};
                      const tier = row.conviction_tier || conv.tier || 'C';
                      const cScore = row.conviction_score ?? conv.score ?? null;
                      const style = getConvictionBadgeStyle(tier);

                      return (
                        <tr key={`${row.symbol}-${i}`} className="hover:bg-white/5 border-b border-white/5">
                          <td className="font-bold text-white">{row.symbol}</td>
                          <td>
                            {cScore !== null && (row.analysis_type === 'qullamaggie' || row.analysis_type === 'early_surf') ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border text-xs font-mono font-black whitespace-nowrap ${style.badge}`}
                              >
                                <span>{style.icon}</span>
                                <span>{tier}</span>
                                <span className="opacity-60">•</span>
                                <span>{cScore}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-white/30">—</span>
                            )}
                          </td>
                          <td className="font-mono">{row.score}</td>
                          <td>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                row.status === 'candidate'
                                  ? 'bg-indigo-500/20 text-indigo-300'
                                  : row.status === 'watch'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-white/10 text-white/50'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="font-mono whitespace-nowrap">
                            <div>${Number(row.price || 0).toFixed(2)}</div>
                            {conv.risk_pct !== null && conv.risk_pct !== undefined && (
                              <div className="text-[10px] text-white/45">
                                Risk: {conv.risk_pct}% ({conv.stop_to_adr ?? '—'}x ADR)
                              </div>
                            )}
                          </td>
                          <td className="text-xs text-white/40 whitespace-nowrap">
                            {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                          </td>
                          <td className="w-full">{formatReason(row)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

