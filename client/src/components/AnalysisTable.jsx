import React, { useEffect, useState } from 'react';

export default function AnalysisTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('qullamaggie');
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

  const filteredData = data.filter(item => {
    if (item.analysis_type !== activeTab) return false;
    if (searchQuery && !item.symbol.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatReason = (reason, type) => {
    if (!reason) return '-';
    
    if (type === 'qullamaggie') {
      return (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge badge-sm badge-outline">Trend: {reason.trend_score}</span>
          <span className="badge badge-sm badge-outline">RS: {reason.rs_score}</span>
          <span className="badge badge-sm badge-outline">Tight: {reason.tightness_score} ({reason.is_tight ? 'Yes' : 'No'})</span>
          <span className="badge badge-sm badge-outline">Dry: {reason.vol_score} ({reason.is_dry ? 'Yes' : 'No'})</span>
          {reason.rvol && <span className="badge badge-sm badge-outline">RVOL: {reason.rvol.toFixed(2)}</span>}
          {reason.ext_pct !== undefined && <span className="badge badge-sm badge-outline">Ext: {(reason.ext_pct * 100).toFixed(1)}%</span>}
        </div>
      );
    }
    
    if (type === 'fundamentals') {
      return (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge badge-sm badge-outline">{reason.sector || 'N/A'}</span>
          <span className="badge badge-sm badge-outline">{reason.market_cap_bucket || 'N/A'}</span>
          <span className="badge badge-sm badge-outline">Growth: {(reason.revenue_growth * 100)?.toFixed(1)}%</span>
          <span className="badge badge-sm badge-outline">Margin: {(reason.net_margin * 100)?.toFixed(1)}%</span>
          {reason.pe_ratio && <span className="badge badge-sm badge-outline">P/E: {reason.pe_ratio.toFixed(1)}</span>}
          {reason.peg_ratio && <span className="badge badge-sm badge-outline">PEG: {reason.peg_ratio.toFixed(2)}</span>}
          <span className="badge badge-sm badge-outline">{reason.has_net_cash ? '✅ Net Cash' : '❌ Debt'}</span>
          <span className={`badge badge-sm ${reason.wheel_fit === 'pass' ? 'badge-success' : 'badge-outline'}`}>Wheel: {reason.wheel_fit}</span>
        </div>
      );
    }

    return JSON.stringify(reason);
  };

  return (
    <div className="w-full flex flex-col mt-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 w-full">
        <h2 className="text-2xl font-bold tracking-tight text-white">Raw Analysis Data</h2>
        
        <input 
          type="text" 
          placeholder="Filter by Ticker..." 
          className="input input-bordered w-full md:w-64 bg-[#141416] text-white border-white/10" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="tabs tabs-boxed mb-6 inline-flex p-1 bg-[#141416] border border-white/5">
        <button 
          className={`tab ${activeTab === 'qullamaggie' ? 'bg-indigo-600 text-white font-bold rounded' : 'text-white/60'}`}
          onClick={() => setActiveTab('qullamaggie')}
        >
          Qullamaggie
        </button>
        <button 
          className={`tab ${activeTab === 'fundamentals' ? 'bg-indigo-600 text-white font-bold rounded' : 'text-white/60'}`}
          onClick={() => setActiveTab('fundamentals')}
        >
          Fundamentals
        </button>
      </div>

      {error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <div className="bg-[#141416] rounded-xl border border-white/10 overflow-hidden w-full">
          <div className="overflow-x-auto w-full">
            <table className="table table-sm md:table-md w-full text-white/90">
              <thead className="bg-[#1a1a1d] text-white/50 uppercase text-xs tracking-wider border-b border-white/10">
                <tr>
                  <th>Symbol</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Date</th>
                  <th>Reason Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <span className="loading loading-spinner text-indigo-500"></span>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-white/40">
                      No records found for the given criteria.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, i) => (
                    <tr key={`${row.symbol}-${i}`} className="hover:bg-white/5 border-b border-white/5">
                      <td className="font-bold text-white">{row.symbol}</td>
                      <td className="font-mono">{row.score}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          row.status === 'candidate' ? 'bg-indigo-500/20 text-indigo-300' : 
                          row.status === 'watch' ? 'bg-amber-500/20 text-amber-300' : 
                          'bg-white/10 text-white/50'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="font-mono">${Number(row.price || 0).toFixed(2)}</td>
                      <td className="text-xs text-white/40 whitespace-nowrap">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="w-full">
                        {formatReason(row.reason, row.analysis_type)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
