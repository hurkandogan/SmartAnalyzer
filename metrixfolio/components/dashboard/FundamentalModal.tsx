import React, { useEffect, useState, useMemo } from 'react';
import { getAnalysesAction, getCommentsAction, addCommentAction } from '@/actions/watchlist';
import { StockAnalysis, WatchlistComment } from '@/types/watchlist';
import { SparklineRow } from './SparklineRow';
import { useAuth } from '@/context/AuthProvider';

interface FundamentalModalProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}

export const FundamentalModal: React.FC<FundamentalModalProps> = ({
  symbol,
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<StockAnalysis[]>([]);
  const [comments, setComments] = useState<WatchlistComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'fundamentals' | 'ai' | 'users'>('fundamentals');
  const [newComment, setNewComment] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen && symbol) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          const [analyses, commentsRes] = await Promise.all([
            getAnalysesAction(symbol, 365),
            getCommentsAction(symbol),
          ]);
          setData(analyses.reverse());
          setComments(commentsRes);
        } catch (error) {
          console.error('Failed to fetch data:', error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    } else {
      setData([]);
      setComments([]);
      setActiveTab('fundamentals');
    }
  }, [isOpen, symbol]);

  const latest = data.length > 0 ? data[data.length - 1] : null;

  // Format date helper (e.g. 2026-06-28 -> Jun 2026)
  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const timelineDates = useMemo(() => {
    if (data.length === 0) return null;
    const start = formatDateLabel(data[0]?.date);
    const end = formatDateLabel(data[data.length - 1]?.date);
    const mid = formatDateLabel(data[Math.floor(data.length / 2)]?.date);
    return { start, mid, end };
  }, [data]);

  // Helper to extract a series for a specific metric
  const getSeries = (key: keyof StockAnalysis) => {
    return data.map((d) => ({ val: d[key] as number }));
  };

  const formatNumber = (val: number | string | null | undefined) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') {
      if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
      if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
      return val.toFixed(2);
    }
    return val;
  };

  const formatPercent = (val: number | string | null | undefined) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') return `${val.toFixed(2)}%`;
    return val;
  };

  if (!isOpen) return null;

  const aiComments = comments.filter((c) => c.author_name === 'Metrixfolio');
  const userComments = comments.filter((c) => c.author_name !== 'Metrixfolio');

  const handlePostComment = async () => {
    if (!user || !newComment.trim()) return;
    setIsPosting(true);
    await addCommentAction(user.uid, symbol, newComment);
    setNewComment('');
    const updated = await getCommentsAction(symbol);
    setComments(updated);
    setIsPosting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative max-w-3xl w-full max-h-[85vh] bg-base-100 shadow-2xl rounded-xl p-6 z-50 border border-base-content/10 flex flex-col">
        <button
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
        >
          ✕
        </button>
        <h3 className="font-bold text-2xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-6 pr-8 flex-shrink-0">
          {symbol.toUpperCase()} Fundamentals
        </h3>
        <div className="tabs tabs-boxed mb-4 bg-base-200/50">
          <a
            className={`tab flex-1 transition-all ${activeTab === 'fundamentals' ? 'tab-active font-bold bg-primary text-primary-content shadow-sm' : 'opacity-70'}`}
            onClick={() => setActiveTab('fundamentals')}
          >
            Charts
          </a>
          <a
            className={`tab flex-1 transition-all ${activeTab === 'ai' ? 'tab-active font-bold bg-secondary text-secondary-content shadow-sm' : 'opacity-70'}`}
            onClick={() => setActiveTab('ai')}
          >
            AI Comments
          </a>
          <a
            className={`tab flex-1 transition-all ${activeTab === 'users' ? 'tab-active font-bold bg-accent text-accent-content shadow-sm' : 'opacity-70'}`}
            onClick={() => setActiveTab('users')}
          >
            User Comments
          </a>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4 flex-grow">
            <span className="loading loading-ring loading-lg text-primary"></span>
            <span className="text-sm text-base-content/70 animate-pulse">Summoning data...</span>
          </div>
        ) : (
          <div className="flex flex-col flex-grow overflow-hidden h-full min-h-[50vh]">
            {activeTab === 'fundamentals' && (
              data.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-base-content/50 flex-grow">
                  No historical fundamental data found for this ticker.
                </div>
              ) : (
                <div className="flex flex-col flex-grow overflow-hidden h-full">
                  <div className="flex-grow overflow-y-auto space-y-2 pr-1 h-full">
                    <SparklineRow label="Price" value={latest?.last_price} data={getSeries('last_price')} color="#3abff8" formatValue={(v) => `$${formatNumber(v)}`} />
                    <SparklineRow label="Market Cap" value={latest?.market_cap} data={getSeries('market_cap')} color="#36d399" formatValue={formatNumber} />
                    <SparklineRow label="P/E Ratio" value={latest?.pe} data={getSeries('pe')} color="#fbbd23" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
                    <SparklineRow label="Forward P/E" value={latest?.forward_pe} data={getSeries('forward_pe')} color="#fbbd23" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
                    <SparklineRow label="EPS" value={latest?.eps} data={getSeries('eps')} color="#f87272" formatValue={(v) => `$${formatNumber(v)}`} />
                    <SparklineRow label="EV/EBITDA" value={latest?.ev_to_ebitda} data={getSeries('ev_to_ebitda')} color="#e879f9" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
                    <SparklineRow label="Profit Margin" value={latest?.profit_margin} data={getSeries('profit_margin')} color="#2dd4bf" formatValue={formatPercent} />
                    <SparklineRow label="Revenue Growth" value={latest?.revenue_growth} data={getSeries('revenue_growth')} color="#4ade80" formatValue={formatPercent} />
                    <SparklineRow label="Dividend Yield" value={latest?.dividend_yield} data={getSeries('dividend_yield')} color="#60a5fa" formatValue={formatPercent} />
                    <SparklineRow label="RSI" value={latest?.rsi} data={getSeries('rsi')} color="#c084fc" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
                    <SparklineRow label="Implied Volatility (IV)" value={latest?.iv} data={getSeries('iv')} color="#fb923c" formatValue={formatPercent} />
                  </div>
                  {timelineDates && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-base-300 dark:border-base-800 text-[10px] text-base-content/40 px-3 flex-shrink-0">
                      <div className="w-1/4 flex-shrink-0 uppercase font-bold tracking-wider">
                        Timeline
                      </div>
                      <div className="w-3/4 flex justify-between items-center px-4 relative">
                        <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0 border-t border-dashed border-base-content/10"></div>
                        <span className="bg-base-100 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-sm font-medium">{timelineDates.start}</span>
                        <span className="bg-base-100 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-sm font-medium">{timelineDates.mid}</span>
                        <span className="bg-base-100 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-sm font-medium">{timelineDates.end}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {activeTab === 'ai' && (
              <div className="flex flex-col h-full overflow-y-auto pr-2 space-y-4">
                {aiComments.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-base-content/50">
                    No AI Insights available yet.
                  </div>
                ) : (
                  aiComments.map((comment) => (
                    <div key={comment.id} className="chat chat-start">
                      <div className="chat-image avatar placeholder">
                        <div className="bg-secondary text-secondary-content rounded-full w-10">
                          <span className="text-xs">AI</span>
                        </div>
                      </div>
                      <div className="chat-header opacity-50 ml-1">
                        Metrixfolio AI
                        <time className="text-xs ml-2">{formatDateLabel(comment.created_at)}</time>
                      </div>
                      <div 
                        className="chat-bubble chat-bubble-secondary bg-secondary/10 text-base-content shadow-sm w-full"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'users' && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-grow overflow-y-auto pr-2 space-y-4 mb-4">
                  {userComments.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-base-content/50">
                      No user comments yet. Be the first!
                    </div>
                  ) : (
                    userComments.map((comment) => (
                      <div key={comment.id} className="chat chat-start">
                        <div className="chat-image avatar placeholder">
                          <div className="bg-neutral text-neutral-content rounded-full w-10">
                            <span className="text-xs">{comment.author_name.charAt(0)}</span>
                          </div>
                        </div>
                        <div className="chat-header opacity-50 ml-1">
                          {comment.author_name}
                          <time className="text-xs ml-2">{formatDateLabel(comment.created_at)}</time>
                        </div>
                        <div className="chat-bubble bg-base-200 text-base-content">{comment.text}</div>
                      </div>
                    ))
                  )}
                </div>
                
                {user ? (
                  <div className="flex gap-2 mt-auto border-t border-base-content/10 pt-4 flex-shrink-0">
                    <input 
                      type="text" 
                      placeholder="Share your thoughts..." 
                      className="input input-bordered w-full bg-base-200/50" 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                    />
                    <button 
                      className="btn btn-accent" 
                      onClick={handlePostComment}
                      disabled={isPosting || !newComment.trim()}
                    >
                      {isPosting ? <span className="loading loading-spinner"></span> : 'Send'}
                    </button>
                  </div>
                ) : (
                  <div className="text-center p-3 bg-base-200 rounded-lg text-sm mt-auto opacity-70 flex-shrink-0">
                    Please log in to leave a comment.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Click outside to close */}
      <div className="absolute inset-0 cursor-pointer -z-10" onClick={onClose}></div>
    </div>
  );
};
