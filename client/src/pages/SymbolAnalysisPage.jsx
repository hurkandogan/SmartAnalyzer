import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function SymbolAnalysisPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('qullamaggie');
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/analysis/${symbol}`);
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
    if (symbol) {
      fetchData();
    }
  }, [symbol]);

  const filteredData = data.filter(item => item.analysis_type === activeTab);

  const formatReason = (reason, type) => {
    if (!reason) return '-';
    
    if (type === 'qullamaggie') {
      return (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">Trend: {reason.trend_score}</span>
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">RS: {reason.rs_score}</span>
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">Tight: {reason.tightness_score} ({reason.is_tight ? 'Yes' : 'No'})</span>
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">Dry: {reason.vol_score} ({reason.is_dry ? 'Yes' : 'No'})</span>
          {reason.rvol && <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">RVOL: {reason.rvol.toFixed(2)}</span>}
          {reason.ext_pct !== undefined && <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">Ext: {(reason.ext_pct * 100).toFixed(1)}%</span>}
        </div>
      );
    }
    
    if (type === 'fundamentals') {
      return (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">{reason.sector || 'N/A'}</span>
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">{reason.market_cap_bucket || 'N/A'}</span>
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">Growth: {(reason.revenue_growth * 100)?.toFixed(1)}%</span>
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">Margin: {(reason.net_margin * 100)?.toFixed(1)}%</span>
          {reason.pe_ratio && <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">P/E: {reason.pe_ratio.toFixed(1)}</span>}
          {reason.peg_ratio && <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">PEG: {reason.peg_ratio.toFixed(2)}</span>}
          <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-white/80">{reason.has_net_cash ? '✅ Net Cash' : '❌ Debt'}</span>
          <span className={`px-2 py-1 rounded border ${reason.wheel_fit === 'pass' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/80'}`}>Wheel: {reason.wheel_fit}</span>
        </div>
      );
    }

    return JSON.stringify(reason);
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 border-b border-white/10 pb-6">
        <button 
          onClick={() => navigate('/universe')}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white/70 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tighter text-white">
            {symbol} Analysis
          </h2>
          <p className="text-white/40 text-sm md:text-base font-medium tracking-wide mt-1">
            Historical analysis scores and screening results.
          </p>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-black/20 border border-white/5 rounded-xl w-fit">
        <button 
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'qullamaggie' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          onClick={() => setActiveTab('qullamaggie')}
        >
          Qullamaggie
        </button>
        <button 
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'fundamentals' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          onClick={() => setActiveTab('fundamentals')}
        >
          Fundamentals
        </button>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-200 p-4 rounded-xl">{error}</div>
      ) : (
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden w-full">
          <div className="overflow-x-auto w-full custom-scrollbar max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#111115]/95 backdrop-blur z-10 text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="py-4 px-4 font-semibold">Date</th>
                  <th className="py-4 px-4 font-semibold">Score</th>
                  <th className="py-4 px-4 font-semibold">Status</th>
                  <th className="py-4 px-4 font-semibold">Price</th>
                  <th className="py-4 px-4 font-semibold w-1/2">Reason Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-white/50">
                      Loading analysis data...
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-white/40">
                      No analysis records found for this symbol.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, i) => (
                    <tr key={i} className="hover:bg-white/5 border-b border-white/5 transition-colors">
                      <td className="py-4 px-4 text-sm text-white/70 whitespace-nowrap">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-white text-lg">{row.score}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          row.status === 'candidate' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 
                          row.status === 'watch' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 
                          'bg-white/5 border-white/10 text-white/50'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-white/90">${Number(row.price || 0).toFixed(2)}</td>
                      <td className="py-4 px-4">
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
