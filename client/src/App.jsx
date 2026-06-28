import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import TickerModal from './components/TickerModal';
import JobPanel from './components/JobPanel';
import LogTerminal from './components/LogTerminal';

function App() {
  const [connection, setConnection] = useState({ connected: false });
  const [tickerData, setTickerData] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState(null);

  // Initial fetch for IBKR status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api', { cache: 'no-store' });
        const data = await res.json();
        setConnection({ connected: data.connected });
      } catch {
        setConnection({ connected: false });
      }
    }
    fetchStatus();
    
    // Auto-refresh connection status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async (symbol) => {
    setLoadingSearch(true);
    setError(null);
    try {
      const res = await fetch(`/api/ticker-data?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`No data found for ${symbol} in DB.`);
        throw new Error('Failed to fetch ticker data.');
      }
      const data = await res.json();
      setTickerData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingSearch(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-indigo-500/30 overflow-x-hidden relative font-sans">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px]" />
      </div>

      <Header connected={connection.connected} />

      <main className="relative z-10 pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center">
        
        {/* Search Section */}
        <div className="w-full text-center space-y-4 mb-8">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-white/40">
            Intelligent Portfolio
          </h2>
          <p className="text-white/40 text-lg md:text-xl font-medium tracking-wide">
            Analyze historical candles and real-time fundamentals.
          </p>
        </div>

        <SearchBar onSearch={handleSearch} isLoading={loadingSearch} />

        {error && (
          <div className="text-rose-400 bg-rose-500/10 px-6 py-3 rounded-xl border border-rose-500/20 mb-8 font-medium">
            {error}
          </div>
        )}

        {/* Jobs & Terminal */}
        <div className="w-full max-w-5xl space-y-8 mt-12">
          <JobPanel />
          <LogTerminal />
        </div>

      </main>

      {/* Modals */}
      {tickerData && (
        <TickerModal data={tickerData} onClose={() => setTickerData(null)} />
      )}
    </div>
  );
}

export default App;
