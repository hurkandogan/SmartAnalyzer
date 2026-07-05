import React, { useState, useEffect } from 'react';
import { Trash2, Play, Plus, RefreshCw } from 'lucide-react';

export default function ScreenerAdmin() {
  const [universe, setUniverse] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [newSymbols, setNewSymbols] = useState('');

  // Local Python API endpoint via Vite proxy or direct
  const API_URL = '/api'; 

  useEffect(() => {
    loadData();
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([loadUniverse(), loadLogs()]);
    setIsLoading(false);
  };

  const loadUniverse = async () => {
    try {
      const res = await fetch(`${API_URL}/screener/universe`);
      if (res.ok) {
        const data = await res.json();
        setUniverse(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/logs?source=screener-sync&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newSymbols.trim()) return;
    const symbolsArray = newSymbols.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_URL}/screener/universe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbolsArray, source_index: 'Custom' })
      });
      if (res.ok) {
        setNewSymbols('');
        await loadUniverse();
      } else {
        alert('Failed to add symbols');
      }
    } catch (err) {
      alert('Failed to add symbols');
    }
  };

  const handleRemove = async (symbol) => {
    if (!window.confirm(`Remove ${symbol} from universe?`)) return;
    try {
      const res = await fetch(`${API_URL}/screener/universe/${symbol}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadUniverse();
      } else {
        alert('Failed to remove symbol');
      }
    } catch (err) {
      alert('Failed to remove symbol');
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${API_URL}/screener/sync?chunk_size=50`, { method: 'POST' });
      if (res.ok) {
        alert('Background sync started for 50 symbols.');
        setTimeout(loadLogs, 2000);
      } else {
        alert('Failed to start sync');
      }
    } catch (err) {
      alert('Failed to start sync');
    }
    setIsSyncing(false);
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-white/50">Loading Screener Settings...</div>;
  }

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 text-left">
      <div className="flex justify-between items-center bg-white/5 border border-white/10 p-6 rounded-2xl">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-400">Screener Settings</h2>
          <p className="text-white/40 mt-1">Manage symbols and monitor 24/7 background syncs.</p>
        </div>
        <button 
          onClick={handleTriggerSync} 
          disabled={isSyncing}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {isSyncing ? <span className="animate-spin text-lg">⟳</span> : <Play size={18} />}
          Trigger Manual Sync
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Universe Management */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col h-[600px]">
          <h3 className="text-xl font-bold mb-4 text-white">Universe ({universe.filter(u => u.is_active).length} Active)</h3>
          
          <form onSubmit={handleAdd} className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder="AAPL, MSFT, NVDA..." 
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-purple-500 uppercase transition-colors"
              value={newSymbols}
              onChange={e => setNewSymbols(e.target.value)}
            />
            <button type="submit" className="bg-purple-500 hover:bg-purple-600 text-white px-5 rounded-xl font-bold flex items-center gap-2 transition-all">
              <Plus size={18} /> Add
            </button>
          </form>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#060608]/90 backdrop-blur z-10 text-white/40 text-sm border-b border-white/10">
                <tr>
                  <th className="py-3 px-2">Symbol</th>
                  <th className="py-3 px-2">Source</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {universe.map(u => (
                  <tr key={u.symbol} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${u.is_active ? '' : 'opacity-50'}`}>
                    <td className="py-3 px-2 font-bold text-white">{u.symbol}</td>
                    <td className="py-3 px-2 text-white/60">{u.source_index}</td>
                    <td className="py-3 px-2">
                      {u.is_active ? <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">Active</span> : <span className="text-xs bg-white/10 text-white/40 px-2 py-1 rounded-full">Inactive</span>}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {u.is_active && (
                        <button onClick={() => handleRemove(u.symbol)} className="text-rose-400 hover:text-rose-300 p-1">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Logs */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col h-[600px] shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-white">Sync Logs</h3>
            <button onClick={loadLogs} className="text-white/40 hover:text-white transition-colors"><RefreshCw size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 font-mono text-sm space-y-3 custom-scrollbar">
            {logs.length === 0 ? (
              <p className="text-white/30 italic">No logs found.</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex gap-3 items-start border-b border-white/5 pb-3">
                  <span className="text-white/30 text-xs mt-0.5 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded uppercase tracking-wider font-bold ${
                    log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400' : 
                    log.level === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-white/80 leading-relaxed">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
