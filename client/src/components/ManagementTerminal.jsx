import React from 'react';
import JobPanel from './JobPanel';
import LogTerminal from './LogTerminal';
import ScreenerAdmin from './ScreenerAdmin';

export default function ManagementTerminal() {
  return (
    <div className="w-full flex flex-col md:flex-row gap-8 items-start relative mt-4">
      {/* Left Sidebar: Triggers */}
      <div className="w-full md:w-64 shrink-0 flex flex-col gap-8 md:sticky md:top-32">
        <JobPanel />
      </div>

      {/* Main Content: Screener & Logs */}
      <div className="flex-1 w-full flex flex-col gap-8 min-w-0">
        <ScreenerAdmin />
        <LogTerminal />
      </div>
    </div>
  );
}
