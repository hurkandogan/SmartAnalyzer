import React from 'react';
import JobPanel from './JobPanel';
import LogTerminal from './LogTerminal';
import MarketStatusCockpit from './MarketStatusCockpit';

export default function ManagementTerminal() {
  return (
    <div className="w-full flex flex-col gap-8 mt-2">
      {/* Live Market Status, Breadth & Options Cockpit */}
      <MarketStatusCockpit />

      <div className="w-full flex flex-col md:flex-row gap-8 items-start relative">
        {/* Left Sidebar: Triggers */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-8 md:sticky md:top-32">
          <JobPanel />
        </div>

        {/* Main Content: Logs */}
        <div className="flex-1 w-full flex flex-col gap-8 min-w-0">
          <LogTerminal />
        </div>
      </div>
    </div>
  );
}
