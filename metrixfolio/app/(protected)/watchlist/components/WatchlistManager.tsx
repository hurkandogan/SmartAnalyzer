'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  getWatchlistAction,
  addWatchlistItemAction,
  removeWatchlistItemAction,
  getCommentsAction,
  addCommentAction,
  updateCommentAction,
  deleteCommentAction,
  getAnalysesAction,
} from '@/actions/watchlist';
import {
  WatchlistItem,
  WatchlistComment,
  StockAnalysis,
} from '@/types/watchlist';
import {
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiMessageSquare,
  FiSend,
  FiX,
  FiChevronDown,
  FiClock,
  FiUser,
} from 'react-icons/fi';
import { AnalysisPanel } from './AnalysisPanel';

export default function WatchlistManager() {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, WatchlistComment[]>>(
    {},
  );
  const [analyses, setAnalyses] = useState<Record<string, StockAnalysis[]>>({});
  const [analysesLoading, setAnalysesLoading] = useState<
    Record<string, boolean>
  >({});
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [isSendingComment, setIsSendingComment] = useState(false);
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

  const toggleAccordion = async (symbol: string) => {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
      return;
    }
    setExpandedSymbol(symbol);
    if (!comments[symbol]) {
      const data = await getCommentsAction(symbol);
      setComments((prev) => ({ ...prev, [symbol]: data }));
    }
    if (!analyses[symbol]) {
      setAnalysesLoading((prev) => ({ ...prev, [symbol]: true }));
      const data = await getAnalysesAction(symbol);
      setAnalyses((prev) => ({ ...prev, [symbol]: data }));
      setAnalysesLoading((prev) => ({ ...prev, [symbol]: false }));
    }
  };

  const handleAddComment = async (symbol: string) => {
    if (!user || !newComment.trim()) return;
    setIsSendingComment(true);
    const res = await addCommentAction(user.uid, symbol, newComment);
    if (res.success) {
      setNewComment('');
      const data = await getCommentsAction(symbol);
      setComments((prev) => ({ ...prev, [symbol]: data }));
    }
    setIsSendingComment(false);
  };

  const handleUpdateComment = async (symbol: string) => {
    if (!user || !editingComment) return;
    const res = await updateCommentAction(
      user.uid,
      symbol,
      editingComment.id,
      editingComment.text,
    );
    if (res.success) {
      setEditingComment(null);
      const data = await getCommentsAction(symbol);
      setComments((prev) => ({ ...prev, [symbol]: data }));
    } else {
      alert(res.message);
    }
  };

  const handleDeleteComment = async (symbol: string, commentId: string) => {
    if (!user) return;
    if (!confirm('Delete this comment?')) return;
    const res = await deleteCommentAction(user.uid, symbol, commentId);
    if (res.success) {
      setComments((prev) => ({
        ...prev,
        [symbol]: prev[symbol].filter((c) => c.id !== commentId),
      }));
    } else {
      alert(res.message);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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
        <div className="card bg-base-100 shadow">
          <div className="card-body items-center text-center">
            <p className="text-lg opacity-60">No items in watchlist yet.</p>
            <p className="text-sm opacity-40">
              Add a symbol above to get started.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const isExpanded = expandedSymbol === item.symbol;
            const itemComments = comments[item.symbol] || [];

            return (
              <div
                key={item.symbol}
                className="collapse-arrow bg-base-100 border-base-300 collapse border shadow-sm"
              >
                <input
                  type="radio"
                  name="watchlist-accordion"
                  checked={isExpanded}
                  onChange={() => toggleAccordion(item.symbol)}
                />
                {/* Accordion Header */}
                <div className="collapse-title flex items-center gap-4 pr-12">
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-primary text-lg font-bold">
                        {item.symbol}
                      </span>
                      <span className="text-xs opacity-60">
                        {item.exchange || 'N/A'}
                      </span>
                    </div>
                    <div className="hidden flex-1 sm:block">
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <div className="hidden gap-2 md:flex">
                      {item.category && (
                        <span className="badge badge-outline badge-sm">
                          {item.category}
                        </span>
                      )}
                      {item.industry && (
                        <span className="badge badge-ghost badge-sm">
                          {item.industry}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs opacity-50">
                      <FiClock className="h-3 w-3" />
                      {formatDate(item.added_at)}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(item.symbol);
                    }}
                    title="Remove from watchlist"
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Accordion Content */}
                <div className="collapse-content">
                  <div className="divider mt-0 mb-2"></div>

                  {/* Info row */}
                  <div className="mb-4 flex flex-wrap gap-3 text-sm sm:hidden">
                    <span className="font-medium">{item.name}</span>
                    {item.category && (
                      <span className="badge badge-outline badge-sm">
                        {item.category}
                      </span>
                    )}
                    {item.industry && (
                      <span className="badge badge-ghost badge-sm">
                        {item.industry}
                      </span>
                    )}
                  </div>

                  {/* Analysis Section */}
                  <div className="mb-4">
                    <AnalysisPanel
                      analyses={analyses[item.symbol] || []}
                      isLoading={analysesLoading[item.symbol] || false}
                    />
                  </div>

                  <div className="divider my-1"></div>

                  {/* Comments Section */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <FiMessageSquare className="text-primary h-4 w-4" />
                      <h3 className="font-semibold">
                        Notes & Analysis
                        {itemComments.length > 0 && (
                          <span className="badge badge-primary badge-xs ml-2">
                            {itemComments.length}
                          </span>
                        )}
                      </h3>
                    </div>

                    {/* Add Comment */}
                    <div className="flex gap-2">
                      <textarea
                        className="textarea textarea-bordered flex-1 text-sm"
                        placeholder="Add your analysis or note..."
                        rows={2}
                        value={expandedSymbol === item.symbol ? newComment : ''}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleAddComment(item.symbol);
                          }
                        }}
                      />
                      <button
                        className="btn btn-primary btn-sm self-end"
                        onClick={() => handleAddComment(item.symbol)}
                        disabled={isSendingComment || !newComment.trim()}
                      >
                        {isSendingComment ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          <FiSend className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Comments List */}
                    {itemComments.length === 0 ? (
                      <p className="py-2 text-center text-sm opacity-40">
                        No notes yet. Be the first to add an analysis.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {itemComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="bg-base-200 rounded-lg p-3"
                          >
                            {editingComment?.id === comment.id ? (
                              /* Edit Mode */
                              <div className="flex flex-col gap-2">
                                <textarea
                                  className="textarea textarea-bordered w-full text-sm"
                                  rows={2}
                                  value={editingComment.text}
                                  onChange={(e) =>
                                    setEditingComment({
                                      ...editingComment,
                                      text: e.target.value,
                                    })
                                  }
                                  autoFocus
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    className="btn btn-ghost btn-xs"
                                    onClick={() => setEditingComment(null)}
                                  >
                                    <FiX className="h-3 w-3" /> Cancel
                                  </button>
                                  <button
                                    className="btn btn-primary btn-xs"
                                    onClick={() =>
                                      handleUpdateComment(item.symbol)
                                    }
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* View Mode */
                              <>
                                <p className="text-sm whitespace-pre-wrap">
                                  {comment.text}
                                </p>
                                <div className="mt-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-xs opacity-50">
                                    <FiUser className="h-3 w-3" />
                                    <span className="font-medium">
                                      {comment.author_name}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {formatDateTime(comment.created_at)}
                                    </span>
                                    {comment.updated_at && (
                                      <span className="italic">(edited)</span>
                                    )}
                                  </div>
                                  {user?.uid === comment.author_id && (
                                    <div className="flex gap-1">
                                      <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() =>
                                          setEditingComment({
                                            id: comment.id,
                                            text: comment.text,
                                          })
                                        }
                                      >
                                        <FiEdit2 className="h-3 w-3" />
                                      </button>
                                      <button
                                        className="btn btn-ghost btn-xs text-error"
                                        onClick={() =>
                                          handleDeleteComment(
                                            item.symbol,
                                            comment.id,
                                          )
                                        }
                                      >
                                        <FiTrash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
