import React, { useState } from 'react';
import { checkWatchlistAction, addWatchlistItemAction } from '@/actions/watchlist';
import { FundamentalModal } from './FundamentalModal';
import { useAuth } from '@/context/AuthProvider';

export const MagicSearchBar: React.FC = () => {
  const [ticker, setTicker] = useState('');
  const [mode, setMode] = useState<'search' | 'add'>('search');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('');
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (mode === 'search') {
        // Search mode: Check if it's in watchlist
        const exists = await checkWatchlistAction(symbol);
        if (exists) {
          setActiveSymbol(symbol);
          setIsModalOpen(true);
        } else {
          setErrorMsg(`${symbol} is not in your watchlist.`);
        }
      } else {
        // Add mode: Add to watchlist
        if (!user) {
          setErrorMsg('You must be logged in to add a ticker.');
          setIsLoading(false);
          return;
        }
        
        const res = await addWatchlistItemAction(user.uid, symbol);
        if (res.success) {
          setErrorMsg(null);
          setTicker('');
          // You could show a success toast here
          alert(`${symbol} added to watchlist!`);
        } else {
          setErrorMsg(res.message || 'Failed to add ticker.');
        }
      }
    } catch (error) {
      console.error(error);
      setErrorMsg('An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full relative z-10 my-4 flex justify-center">
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center w-full max-w-md group transition-all duration-300 mx-auto"
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-accent rounded-full opacity-35 group-focus-within:opacity-100 group-hover:opacity-75 blur-md transition duration-500"></div>
        
        <div className="relative flex items-center w-full bg-base-100 rounded-full border border-base-content/10 shadow-lg p-1">
          <select
            className="select select-ghost select-sm focus:bg-base-200 outline-none rounded-l-full rounded-r-none border-0 text-xs md:text-sm font-semibold pl-4 pr-6 focus:outline-none focus:ring-0 appearance-none bg-transparent h-9"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'search' | 'add')}
          >
            <option className="text-sm py-2 font-normal" value="search">Search</option>
            <option className="text-sm py-2 font-normal" value="add">Add</option>
          </select>
          
          <div className="w-px h-6 bg-base-content/20 mx-1.5"></div>
          
          <input
            type="text"
            placeholder={mode === 'search' ? "Search Tickers" : "Add Tickers"}
            className="input input-ghost input-sm w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-sm md:text-base font-semibold placeholder:text-base-content/20 placeholder:font-light tracking-widest h-9 uppercase"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            disabled={isLoading}
          />
          
          <button
            type="submit"
            className="btn btn-circle btn-primary btn-sm mr-1 flex-shrink-0"
            disabled={isLoading || !ticker.trim()}
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : mode === 'search' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        </div>
      </form>
      
      {errorMsg && (
        <div className="absolute w-full flex justify-center mt-2">
          <div className="badge badge-error badge-outline animate-bounce">
            {errorMsg}
          </div>
        </div>
      )}

      <FundamentalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        symbol={activeSymbol}
      />
    </div>
  );
};
