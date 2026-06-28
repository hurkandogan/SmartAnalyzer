import React, { useEffect, useState } from 'react';
import { Terminal, RefreshCw } from 'lucide-react';
import { cn } from '../utils';

export default function LogTerminal() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=50', { cache: 'no-store' });
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchLogs();
    setTimeout(() => setLoading(false), 500);
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // 5 sec auto refresh
    return () => clearInterval(interval);
  }, []);

  const getLogColor = (level) => {
    switch (level?.toUpperCase()) {
      case 'ERROR': return 'text-rose-500';
      case 'SUCCESS': return 'text-emerald-500';
      case 'INFO': return 'text-indigo-400';
      default: return 'text-white/70';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-12 bg-[#0A0A0B] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col h-96">
      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-white/50" />
          <span className="text-sm font-bold text-white/70 tracking-wider">SYSTEM LOGS</span>
        </div>
        <button 
          onClick={handleManualRefresh}
          className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm space-y-1">
        {logs.length === 0 ? (
          <div className="text-white/30 italic">No logs available.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex flex-col sm:flex-row gap-2 sm:gap-4 hover:bg-white/5 p-1 rounded">
              <span className="text-white/30 shrink-0">
                [{new Date(log.timestamp).toLocaleString()}]
              </span>
              <span className={cn("shrink-0 font-bold", getLogColor(log.level))}>
                [{log.level}]
              </span>
              <span className="text-purple-400 shrink-0">
                [{log.source}]
              </span>
              <span className="text-white/80 break-words">
                {log.message}
                {log.details && (
                  <span className="text-white/40 ml-2 italic">{log.details}</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
