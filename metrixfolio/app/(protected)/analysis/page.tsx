import React from 'react';
import { getAnalysisCandidatesAction } from '@/actions/analysis';
import AnalysisView from './components/AnalysisView';

export const dynamic = 'force-dynamic';

export default async function AnalysisPage() {
  const assets = await getAnalysisCandidatesAction();

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-[1600px] mb-24">
      <div className="mb-6">
        <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
          Analysis Candidates
        </h1>
        <p className="opacity-70 max-w-3xl mb-4 text-sm">
          Stocks that have been analyzed by the system and match our trading setups.
        </p>
        
        {/* Bot Schedule Info */}
        <div className="flex flex-wrap gap-2 text-xs opacity-60 font-mono">
          <div className="bg-base-200 px-3 py-1.5 rounded-lg border border-base-300">
            🤖 <span className="font-bold">Data Miner:</span> 03:00 (Mon-Fri)
          </div>
          <div className="bg-base-200 px-3 py-1.5 rounded-lg border border-base-300">
            ⚙️ <span className="font-bold">Analysis Bot:</span> 14:00 (Mon-Fri)
          </div>
        </div>
      </div>

      <AnalysisView initialAssets={assets} />
    </div>
  );
}
