import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, MoreVertical, LineChart, Database, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UniversePage() {
  const [universe, setUniverse] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSymbols, setNewSymbols] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'superlist'
  const [toast, setToast] = useState(null);

  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const API_URL = '/api';

  useEffect(() => {
    loadData();

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleToggleStar = async (symbol) => {
    // Optimistic UI update
    setUniverse((prev) =>
      prev.map((item) =>
        item.symbol === symbol ? { ...item, is_starred: !item.is_starred } : item
      )
    );

    try {
      const res = await fetch(`${API_URL}/screener/universe/${symbol}/star`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        throw new Error('Failed to toggle star');
      }
      const data = await res.json();
      setUniverse((prev) =>
        prev.map((item) =>
          item.symbol === symbol ? { ...item, is_starred: Boolean(data.is_starred) } : item
        )
      );
      showToast(
        data.is_starred
          ? `⭐ ${symbol} added to Superlist`
          : `${symbol} removed from Superlist`,
        'success'
      );
    } catch (err) {
      // Revert optimistic update on failure
      await loadUniverse();
      showToast(`Could not update Superlist status for ${symbol}`, 'error');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newSymbols.trim()) return;

    const symbolsArray = Array.from(
      new Set(
        newSymbols
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    const existingSymbols = new Set(
      universe.filter((u) => u.is_active).map((u) => u.symbol.toUpperCase())
    );
    const duplicates = symbolsArray.filter((s) => existingSymbols.has(s));
    const newSymbolsToAdd = symbolsArray.filter((s) => !existingSymbols.has(s));

    if (newSymbolsToAdd.length === 0) {
      showToast(`Girdiğiniz tüm hisseler listede zaten ekli: ${duplicates.join(', ')}`, 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/screener/universe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newSymbolsToAdd, source_index: 'Custom' }),
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
        method: 'DELETE',
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
    return (
      <div className="flex h-64 items-center justify-center text-white/50 w-full">
        Loading Universe...
      </div>
    );
  }

  const activeCount = universe.filter((u) => u.is_active).length;
  const superlistCount = universe.filter((u) => u.is_active && u.is_starred).length;

  const filteredUniverse = universe
    .filter((u) => {
      if (filterMode === 'superlist' && !u.is_starred) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (u.symbol && u.symbol.toLowerCase().includes(term)) ||
        (u.long_name && u.long_name.toLowerCase().includes(term)) ||
        (u.sector && u.sector.toLowerCase().includes(term)) ||
        (u.industry && u.industry.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      // Starred (Superlist) items first, then alphabetical
      if (Boolean(b.is_starred) !== Boolean(a.is_starred)) {
        return b.is_starred ? 1 : -1;
      }
      return (a.symbol || '').localeCompare(b.symbol || '');
    });

  return (
    <div className="w-full flex flex-col gap-8 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full text-center md:text-left space-y-2 border-b border-white/10 pb-6">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">
          Stock Universe
        </h2>
        <p className="text-white/40 text-sm md:text-base font-medium tracking-wide">
          Manage your active stock universe, star priority symbols for your Superlist, and track Superlist earnings.
        </p>
      </div>

      <div className="w-full">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col min-h-[600px] h-[calc(100vh-280px)]">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  filterMode === 'all'
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                    : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                All Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('superlist')}
                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                  filterMode === 'superlist'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                }`}
              >
                <Star size={16} className={filterMode === 'superlist' ? 'fill-black' : 'fill-amber-400'} />
                Superlist ({superlistCount})
              </button>
            </div>
          </div>

          <form onSubmit={handleAdd} className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Add symbols e.g. AAPL, MSFT, NVDA..."
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 uppercase transition-colors"
              value={newSymbols}
              onChange={(e) => setNewSymbols(e.target.value)}
            />
            <button
              type="submit"
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 rounded-xl font-bold flex items-center gap-2 transition-all"
            >
              <Plus size={20} /> Add
            </button>
          </form>

          <div className="mb-6">
            <input
              type="text"
              placeholder="Search by symbol, company, sector, industry..."
              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/20 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative" ref={menuRef}>
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#060608]/90 backdrop-blur z-10 text-white/40 text-sm border-b border-white/10">
                <tr>
                  <th className="py-4 px-3 w-12 font-semibold text-center">⭐</th>
                  <th className="py-4 px-3 font-semibold">Symbol / Company</th>
                  <th className="py-4 px-3 font-semibold">Sector & Industry</th>
                  <th className="py-4 px-3 font-semibold">Exchange</th>
                  <th className="py-4 px-3 font-semibold">Status</th>
                  <th className="py-4 px-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUniverse.map((u) => (
                  <tr
                    key={u.symbol}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                      u.is_active ? '' : 'opacity-50'
                    } ${u.is_starred ? 'bg-amber-500/[0.03]' : ''}`}
                  >
                    <td className="py-4 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStar(u.symbol)}
                        title={u.is_starred ? 'Remove from Superlist' : 'Add to Superlist'}
                        className="p-2 rounded-lg hover:bg-white/10 transition-all"
                      >
                        <Star
                          size={18}
                          className={
                            u.is_starred
                              ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                              : 'text-white/20 hover:text-amber-400/60'
                          }
                        />
                      </button>
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-lg">{u.symbol}</span>
                        {u.is_starred && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Superlist
                          </span>
                        )}
                      </div>
                      <div
                        className="text-sm text-white/40 max-w-[200px] truncate"
                        title={u.long_name}
                      >
                        {u.long_name || 'N/A'}
                      </div>
                    </td>
                    <td className="py-4 px-3">
                      <div className="text-sm font-medium text-white/80">{u.sector || 'N/A'}</div>
                      <div
                        className="text-xs text-white/40 max-w-[200px] truncate"
                        title={u.industry}
                      >
                        {u.industry || 'N/A'}
                      </div>
                    </td>
                    <td className="py-4 px-3">
                      <div className="text-sm text-white/70">{u.exchange || 'SMART'}</div>
                      <div className="text-xs text-white/40">{u.currency || 'USD'}</div>
                    </td>
                    <td className="py-4 px-3">
                      {u.is_active ? (
                        <span className="text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs font-semibold bg-white/5 border border-white/10 text-white/40 px-2.5 py-1 rounded-full">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-3 text-right relative">
                      {u.is_active && (
                        <div className="inline-block relative">
                          <button
                            onClick={() => setOpenMenu(openMenu === u.symbol ? null : u.symbol)}
                            className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <MoreVertical size={20} />
                          </button>

                          {openMenu === u.symbol && (
                            <div className="absolute right-0 mt-2 w-48 bg-[#111115] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                              <button
                                onClick={() => navigate(`/analysis/${u.symbol}`)}
                                className="w-full text-left px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                              >
                                <LineChart size={16} className="text-indigo-400" />
                                Analysis
                              </button>
                              <button
                                onClick={() => navigate(`/data/${u.symbol}`)}
                                className="w-full text-left px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                              >
                                <Database size={16} className="text-purple-400" />
                                Data
                              </button>
                              <div className="h-px w-full bg-white/5 my-1" />
                              <button
                                onClick={() => {
                                  handleRemove(u.symbol);
                                  setOpenMenu(null);
                                }}
                                className="w-full text-left px-4 py-3 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-3 transition-colors"
                              >
                                <Trash2 size={16} />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
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
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md px-5 py-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-5 ${
            toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/30 text-rose-200'
              : 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 text-sm font-medium whitespace-pre-line">{toast.msg}</div>
            <button
              onClick={() => setToast(null)}
              className="text-white/50 hover:text-white text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
