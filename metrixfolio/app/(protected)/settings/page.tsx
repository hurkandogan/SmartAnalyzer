'use client';

import ConnectionsManager from './components/ConnectionsManager';

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <div className="prose">
        <h1>Settings</h1>
      </div>

      <div className="bg-base-100/50 backdrop-blur-md border-base-content/5 border rounded-box p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Connections</h2>
          <p className="text-base-content/60 text-sm">Configure external data sources. Positions sync automatically once per day on login.</p>
        </div>
        <ConnectionsManager />
      </div>
    </div>
  );
}
