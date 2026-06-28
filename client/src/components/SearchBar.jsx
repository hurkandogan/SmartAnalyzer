import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

export default function SearchBar({ onSearch, isLoading }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim().toUpperCase());
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-24 mb-12">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
        <div className="relative flex items-center bg-base-300/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="pl-6 text-white/50">
            <Search className="w-6 h-6" />
          </div>
          <input
            type="text"
            className="w-full bg-transparent border-none text-2xl px-6 py-5 text-white placeholder-white/30 focus:outline-none focus:ring-0 uppercase tracking-widest"
            placeholder="ENTER TICKER (e.g., AAPL)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="px-8 h-full bg-white/5 hover:bg-white/10 border-l border-white/10 text-white font-bold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
          >
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'ANALYZE'}
          </button>
        </div>
      </form>
    </div>
  );
}
