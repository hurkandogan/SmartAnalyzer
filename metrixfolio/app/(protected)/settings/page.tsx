'use client';

import CategoryManager from './components/CategoryManager';
import ConnectionsManager from './components/ConnectionsManager';

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <div className="prose">
        <h1>Settings</h1>
      </div>

      <div role="tablist" className="tabs tabs-lifted tabs-lg">
        <input
          type="radio"
          name="settings_tabs"
          role="tab"
          className="tab"
          aria-label="Categories"
          defaultChecked
        />
        <div
          role="tabpanel"
          className="tab-content bg-base-100 border-base-300 rounded-box p-6"
        >
          <CategoryManager />
        </div>

        <input
          type="radio"
          name="settings_tabs"
          role="tab"
          className="tab"
          aria-label="Connections"
        />
        <div
          role="tabpanel"
          className="tab-content bg-base-100 border-base-300 rounded-box p-6"
        >
          <div className="mb-4">
            <h2 className="text-xl font-bold">Connections</h2>
            <p className="text-base-content/60 text-sm">Configure external data sources. Positions sync automatically once per day on login.</p>
          </div>
          <ConnectionsManager />
        </div>
      </div>
    </div>
  );
}
