import React from 'react';
import { Activity, Radio } from 'lucide-react';
import { cn } from '../utils';

export default function Header({ connected }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-base-300/30 backdrop-blur-md border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Activity className="text-white w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tight">
          SmartAnalyser
        </h1>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-black/40 border border-white/5 shadow-inner">
        <span className="text-sm font-medium text-white/70">IBKR Status</span>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <div className={cn(
              "absolute w-4 h-4 rounded-full animate-ping opacity-75",
              connected ? "bg-emerald-500" : "bg-rose-500"
            )} />
            <div className={cn(
              "relative w-3 h-3 rounded-full border-2 border-base-300",
              connected ? "bg-emerald-500" : "bg-rose-500"
            )} />
          </div>
          <span className={cn(
            "text-sm font-bold tracking-wide",
            connected ? "text-emerald-400" : "text-rose-400"
          )}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
      </div>
    </header>
  );
}
