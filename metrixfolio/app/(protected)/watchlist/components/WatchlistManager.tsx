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
              <div className="flex flex-1 items-center gap-6">
                <div className="flex flex-col w-24">
                  <span className="text-primary text-xl font-bold">
                    {item.symbol}
                  </span>
                  <span className="text-xs opacity-60">
                    {item.exchange || 'N/A'}
                  </span>
                </div>
                <div className="hidden flex-1 sm:block">
                  <span className="text-base font-medium">{item.name}</span>
                </div>
                <div className="hidden gap-2 md:flex">
                  {item.category && (
                    <span className="badge badge-outline">
                      {item.category}
                    </span>
                  )}
                  {item.industry && (
                    <span className="badge badge-ghost">
                      {item.industry}
                    </span>
                  )}
                </div>
                <div className="hidden items-center gap-1 text-xs opacity-50 lg:flex">
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
