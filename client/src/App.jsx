import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ManagementTerminal from './components/ManagementTerminal';
import ScreenerAdmin from './components/ScreenerAdmin';

function App() {
  const [connection, setConnection] = useState({ connected: false });
  const [tickerData, setTickerData] = useState(null);
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



  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-indigo-500/30 overflow-x-hidden relative font-sans">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px]" />
      </div>

      <Header connected={connection.connected} />

      <main className="relative z-10 pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center">
        
        {/* Header Section */}
        <div className="w-full text-center md:text-left space-y-2 mb-8 border-b border-white/10 pb-6">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">
            Management Terminal
          </h2>
          <p className="text-white/40 text-sm md:text-base font-medium tracking-wide">
            Manage background syncs, watchlists, and view real-time system logs.
          </p>
        </div>

        <ManagementTerminal />

      </main>

      {/* Modals */}
      {tickerData && (
        <TickerModal data={tickerData} onClose={() => setTickerData(null)} />
      )}
    </div>
  );
}

export default App;
