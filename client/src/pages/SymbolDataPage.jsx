import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function SymbolDataPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('fundamentals');
  const [data, setData] = useState({ fundamentals: [], candles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [fundRes, candleRes] = await Promise.all([
          fetch(`/api/data/${symbol}/fundamentals`),
          fetch(`/api/data/${symbol}/candles`)
        ]);
        
        if (!fundRes.ok || !candleRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const fundamentals = await fundRes.json();
        const candles = await candleRes.json();
        
        setData({ fundamentals, candles });
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
            {symbol} Data
          </h2>
          <p className="text-white/40 text-sm md:text-base font-medium tracking-wide mt-1">
            Historical 1-year fundamental and candle data.
          </p>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-black/20 border border-white/5 rounded-xl w-fit">
        <button 
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'fundamentals' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          onClick={() => setActiveTab('fundamentals')}
        >
          Fundamentals
        </button>
        <button 
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'candles' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          onClick={() => setActiveTab('candles')}
        >
          Candles
        </button>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-200 p-4 rounded-xl">{error}</div>
      ) : (
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden w-full">
          <div className="overflow-x-auto w-full custom-scrollbar max-h-[600px]">
            {loading ? (
              <div className="text-center py-16 text-white/50">Loading data...</div>
            ) : activeTab === 'fundamentals' ? (
              data.fundamentals.length === 0 ? (
                <div className="text-center py-16 text-white/40">No fundamental data found for this symbol.</div>
              ) : (
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="sticky top-0 bg-[#111115]/95 backdrop-blur z-10 text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
                    <tr>
                      <th className="py-4 px-4 font-semibold">Date</th>
                      <th className="py-4 px-4 font-semibold">P/E</th>
                      <th className="py-4 px-4 font-semibold">PEG</th>
                      <th className="py-4 px-4 font-semibold">ROE</th>
                      <th className="py-4 px-4 font-semibold">Rev Growth</th>
                      <th className="py-4 px-4 font-semibold">Market Cap</th>
                      <th className="py-4 px-4 font-semibold">Net Margin</th>
                      <th className="py-4 px-4 font-semibold">Total Cash</th>
                      <th className="py-4 px-4 font-semibold">Total Debt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fundamentals.map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 border-b border-white/5 transition-colors">
                        <td className="py-3 px-4 text-sm text-white/80">{new Date(row.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.pe?.toFixed(2) || '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.peg?.toFixed(2) || '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.roe ? (row.roe * 100).toFixed(2) + '%' : '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.revenue_growth_yoy ? (row.revenue_growth_yoy * 100).toFixed(2) + '%' : '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.market_cap ? (row.market_cap / 1e9).toFixed(2) + 'B' : '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.net_margin ? (row.net_margin * 100).toFixed(2) + '%' : '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.total_cash ? (row.total_cash / 1e9).toFixed(2) + 'B' : '-'}</td>
                        <td className="py-3 px-4 text-sm font-mono text-white/90">{row.total_debt ? (row.total_debt / 1e9).toFixed(2) + 'B' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              data.candles.length === 0 ? (
                <div className="text-center py-16 text-white/40">No candle data found for this symbol.</div>
              ) : (
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="sticky top-0 bg-[#111115]/95 backdrop-blur z-10 text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
                    <tr>
                      <th className="py-4 px-4 font-semibold">Date</th>
                      <th className="py-4 px-4 font-semibold">Open</th>
                      <th className="py-4 px-4 font-semibold">High</th>
                      <th className="py-4 px-4 font-semibold">Low</th>
                      <th className="py-4 px-4 font-semibold">Close</th>
                      <th className="py-4 px-4 font-semibold">Volume</th>
                      <th className="py-4 px-4 font-semibold text-white/30">EMA 10</th>
                      <th className="py-4 px-4 font-semibold text-white/30">EMA 20</th>
                      <th className="py-4 px-4 font-semibold text-white/30">SMA 50</th>
                      <th className="py-4 px-4 font-semibold text-white/30">SMA 200</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.candles.map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 border-b border-white/5 transition-colors">
                        <td className="py-2.5 px-4 text-sm text-white/80">{new Date(row.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-white/90">${row.open?.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-emerald-400">${row.high?.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-rose-400">${row.low?.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-sm font-mono font-bold text-white">${row.close?.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-white/80">{row.volume?.toLocaleString() || '-'}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-white/30">{row.ema_10 ? `$${row.ema_10.toFixed(2)}` : '-'}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-white/30">{row.ema_20 ? `$${row.ema_20.toFixed(2)}` : '-'}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-white/30">{row.sma_50 ? `$${row.sma_50.toFixed(2)}` : '-'}</td>
                        <td className="py-2.5 px-4 text-sm font-mono text-white/30">{row.sma_200 ? `$${row.sma_200.toFixed(2)}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
