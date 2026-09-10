import React, { useState, useEffect } from 'react';
import { Trash2, Play, Plus, RefreshCw } from 'lucide-react';

export default function ScreenerAdmin() {
  const [universe, setUniverse] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSymbols, setNewSymbols] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Local Python API endpoint via Vite proxy or direct
  const API_URL = '/api'; 

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    await loadUniverse();
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



  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newSymbols.trim()) return;
    
    const symbolsArray = Array.from(new Set(newSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)));
    
    // Check for duplicates against currently active symbols
    const existingSymbols = new Set(universe.filter(u => u.is_active).map(u => u.symbol.toUpperCase()));
    const duplicates = symbolsArray.filter(s => existingSymbols.has(s));
    const newSymbolsToAdd = symbolsArray.filter(s => !existingSymbols.has(s));
    
    if (newSymbolsToAdd.length === 0) {
      showToast(`Girdiğiniz tüm hisseler listede zaten ekli: ${duplicates.join(', ')}`, 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/screener/universe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newSymbolsToAdd, source_index: 'Custom' })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setNewSymbols('');
        await loadUniverse();
        
        let msg = '';
        if (data.added && data.added.length > 0) {
          msg += `Başarıyla eklendi: ${data.added.join(', ')}`;
        }
        if (data.failed && data.failed.length > 0) {
          msg += `${msg ? '\n\n' : ''}Geçersiz olduğu için eklenemeyenler (IBKR'da bulunamadı): ${data.failed.join(', ')}`;
        }
        if (duplicates.length > 0) {
          msg += `${msg ? '\n\n' : ''}Zaten ekli olduğu için atlananlar: ${duplicates.join(', ')}`;
        }
        showToast(msg, 'success');
      } else {
        showToast(data.detail || 'Hisseler eklenirken hata oluştu.', 'error');
      }
    } catch (err) {
      showToast('Hisseler eklenirken hata oluştu.', 'error');
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
        showToast('Failed to remove symbol', 'error');
      }
    } catch (err) {
      showToast('Failed to remove symbol', 'error');
    }
  };



  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-white/50">Loading Screener Settings...</div>;
  }

  const filteredUniverse = universe.filter(u => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.symbol && u.symbol.toLowerCase().includes(term)) ||
      (u.long_name && u.long_name.toLowerCase().includes(term)) ||
      (u.sector && u.sector.toLowerCase().includes(term)) ||
      (u.industry && u.industry.toLowerCase().includes(term))
    );
  });

  return (
    <div className="w-full flex flex-col gap-8 text-left">

      <div className="w-full">
        {/* Universe Management */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Universe ({universe.filter(u => u.is_active).length} Active)</h3>
          </div>
          
          <form onSubmit={handleAdd} className="flex gap-2 mb-4">
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

          <div className="mb-4">
            <input 
              type="text" 
              placeholder="Live search by symbol, company, sector, industry..." 
              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2 text-white outline-none focus:border-white/20 transition-colors"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#060608]/90 backdrop-blur z-10 text-white/40 text-sm border-b border-white/10">
                <tr>
                  <th className="py-3 px-2">Symbol / Company</th>
                  <th className="py-3 px-2">Sector & Industry</th>
                  <th className="py-3 px-2">Exchange</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUniverse.map(u => (
                  <tr key={u.symbol} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${u.is_active ? '' : 'opacity-50'}`}>
                    <td className="py-3 px-2">
                      <div className="font-bold text-white">{u.symbol}</div>
                      <div className="text-xs text-white/40 max-w-[180px] truncate" title={u.long_name}>
                        {u.long_name || 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="text-sm text-white/80">{u.sector || 'N/A'}</div>
                      <div className="text-xs text-white/40 max-w-[180px] truncate" title={u.industry}>
                        {u.industry || 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="text-sm text-white/70">{u.exchange || 'SMART'}</div>
                      <div className="text-xs text-white/40">{u.currency || 'USD'}</div>
                    </td>
                    <td className="py-3 px-2">
                      {u.is_active ? (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">Active</span>
                      ) : (
                        <span className="text-xs bg-white/10 text-white/40 px-2 py-1 rounded-full">Inactive</span>
                      )}
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
      </div>
      
      {toast && (
        <div className="toast toast-bottom toast-end z-50">
          <div className={`alert ${toast.type === 'error' ? 'alert-error' : 'alert-success'} flex items-center gap-2 whitespace-pre-line`}>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
