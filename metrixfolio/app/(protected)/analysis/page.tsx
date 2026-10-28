import React from 'react';
import { getAnalysisCandidatesAction, getDroppedAnalysesAction } from '@/actions/analysis';
import AnalysisView from './components/AnalysisView';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage() {
  const [assets, dropped] = await Promise.all([
    getAnalysisCandidatesAction(),
    getDroppedAnalysesAction(),
  ]);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1600px] mb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black mb-1 flex items-center gap-3">
            Analysis &amp; Swing Desk
          </h1>
          <p className="opacity-70 max-w-3xl text-xs md:text-sm">
            Active &amp; paused Qullamaggie swing setups, portfolio risk budget gauge, trade execution tracker, and shared community notes.
          </p>
        </div>

        {/* Bot Schedule Info */}
        <div className="flex flex-wrap gap-2 text-xs opacity-60 font-mono shrink-0">
          <div className="bg-base-200 px-3 py-1.5 rounded-lg border border-base-300">
            🤖 <span className="font-bold">Data Miner:</span> 03:00 (Mon-Fri)
          </div>
          <div className="bg-base-200 px-3 py-1.5 rounded-lg border border-base-300">
            ⚙️ <span className="font-bold">Analysis Bot:</span> 08:00 (Mon-Fri)
          </div>
        </div>
      </div>

      <AnalysisView initialAssets={assets} initialDropped={dropped} />
    </div>
  );
}
