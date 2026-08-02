'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  getWatchlistAction,
  addWatchlistItemAction,
  removeWatchlistItemAction,
} from '@/actions/watchlist';
import { WatchlistItem } from '@/types/watchlist';
import { FiPlus, FiTrash2, FiClock } from 'react-icons/fi';

export default function WatchlistManager() {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWatchlist();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadWatchlist();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadWatchlist = async () => {
    setIsLoading(true);
    const data = await getWatchlistAction();
    setItems(data);
    setIsLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newSymbol.trim()) return;

    setIsAdding(true);
    const res = await addWatchlistItemAction(user.uid, newSymbol);
    if (res.success) {
      setNewSymbol('');
      await loadWatchlist();
    } else {
      alert(res.message);
    }
    setIsAdding(false);
    inputRef.current?.focus();
  };

  const handleRemove = async (symbol: string) => {
    if (!user) return;
    if (!confirm(`Remove ${symbol} from watchlist?`)) return;
    await removeWatchlistItemAction(user.uid, symbol);
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="ml-4 text-lg">Loading watchlist...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl font-bold">Watchlist</h1>

      {/* Add Symbol Form */}
      <form onSubmit={handleAdd} className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          placeholder="Enter symbol (e.g. AAPL)"
          className="input input-bordered input-primary w-full max-w-xs uppercase"
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isAdding || !newSymbol.trim()}
        >
          {isAdding ? (
            <span className="loading loading-spinner loading-sm"></span>
          ) : (
            <FiPlus className="h-5 w-5" />
          )}
          Add
        </button>
      </form>

      {/* Watchlist Items */}
      {items.length === 0 ? (
        <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="card-body items-center text-center">
            <p className="text-lg opacity-60">No items in watchlist yet.</p>
            <p className="text-sm opacity-40">
              Add a symbol above to get started.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center justify-between rounded-box bg-base-100/50 backdrop-blur-md border border-base-content/5 p-4 shadow-sm hover:bg-base-200/50 transition-colors"
            >
              <div className="flex flex-1 items-center gap-4">
                {/* Ticker */}
                <div className="flex flex-col w-20 shrink-0">
                  <span className="text-primary text-xl font-bold">
                    {item.symbol}
                  </span>
                  {item.exchange && (
                    <span className="text-xs opacity-60">
                      {item.exchange}
                    </span>
                  )}
                </div>

                {/* Company Name */}
                <div className="hidden sm:flex flex-col justify-center w-56 shrink-0 bg-base-200/40 rounded-lg px-3 py-2 h-14">
                  <span className="text-[10px] uppercase tracking-wider opacity-50 mb-0.5">Company</span>
                  <span className="text-sm font-medium truncate" title={item.name}>{item.name || '-'}</span>
                </div>
                
                {/* Price */}
                <div className="hidden md:flex flex-col justify-center items-end w-24 shrink-0 bg-base-200/40 rounded-lg px-3 py-2 h-14">
                  <span className="text-[10px] uppercase tracking-wider opacity-50 w-full text-left mb-0.5">Price</span>
                  <span className="text-sm font-semibold">
                    {item.last_price != null ? `$${item.last_price.toFixed(2)}` : '-'}
                  </span>
                </div>

                {/* IV */}
                <div className="hidden md:flex flex-col justify-center items-end w-20 shrink-0 bg-base-200/40 rounded-lg px-3 py-2 h-14">
                  <span className="text-[10px] uppercase tracking-wider opacity-50 w-full text-left mb-0.5">IV</span>
                  <span className={`text-sm font-semibold ${item.iv != null && item.iv > 45 ? 'text-warning' : ''}`}>
                    {item.iv != null ? `${item.iv.toFixed(1)}%` : '-'}
                  </span>
                </div>

                {/* Sector / Industry */}
                <div className="hidden lg:flex flex-col justify-center w-80 shrink-0 bg-base-200/40 rounded-lg px-3 py-2 h-14">
                  <span className="text-[10px] uppercase tracking-wider opacity-50 mb-0.5">Sector & Industry</span>
                  <div className="flex gap-1 items-center">
                    {item.category ? (
                      <span className="badge badge-outline badge-sm text-[10px] truncate max-w-[120px]" title={item.category}>
                        {item.category}
                      </span>
                    ) : null}
                    {item.industry ? (
                      <span className="badge badge-ghost badge-sm text-[10px] truncate max-w-[180px]" title={item.industry}>
                        {item.industry}
                      </span>
                    ) : null}
                    {!item.category && !item.industry && <span className="text-sm font-medium">-</span>}
                  </div>
                </div>

                {/* Spacer */}
                <div className="flex-1"></div>

                {/* Added Date */}
                <div className="hidden xl:flex items-center gap-1 text-xs opacity-40 shrink-0">
                  <FiClock className="h-3 w-3" />
                  {formatDate(item.added_at)}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-circle text-error hover:bg-error/10 ml-4"
                onClick={() => handleRemove(item.symbol)}
                title="Remove from watchlist"
              >
                <FiTrash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
