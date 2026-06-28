'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  saveIBKRConfigAction,
  syncIBKRAction,
  syncIBKRFromParsedAction,
  getIBKRConfigAction,
} from '@/actions/ibkr';
import { parseIBKRXml } from '@/utils/ibkr-parser';
import useSWR from 'swr';
import { FiRefreshCw, FiSave, FiUpload, FiChevronDown } from 'react-icons/fi';

export default function ConnectionsManager() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [queryId, setQueryId] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: config, mutate } = useSWR(
    user ? ['ibkr-config', user.uid] : null,
    ([, uid]) => getIBKRConfigAction(uid),
    { revalidateOnFocus: false },
  );

  // Pre-fill form when config loads
  const handleOpen = () => {
    if (!open && config) {
      setQueryId(config.ibkr_query_id ?? '');
      setToken(config.ibkr_token ?? '');
    }
    setOpen((v) => !v);
    setStatus(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setStatus(null);
    const res = await saveIBKRConfigAction(user.uid, queryId, token);
    setSaving(false);
    setStatus(res.success ? { ok: true, msg: 'Credentials saved.' } : { ok: false, msg: res.message ?? 'Error' });
    if (res.success) mutate();
  };

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    setStatus(null);
    const res = await syncIBKRAction(user.uid);
    setSyncing(false);
    if (res.success) {
      setStatus({ ok: true, msg: `Synced ${res.synced} positions. Last sync: ${res.lastSync}` });
      mutate();
    } else {
      setStatus({ ok: false, msg: res.message ?? 'Sync failed' });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setStatus(null);
    try {
      const text = await file.text();
      const { assets, cashPositions, reportDate } = parseIBKRXml(text);
      const res = await syncIBKRFromParsedAction(user.uid, assets, cashPositions, reportDate);
      if (res.success) {
        setStatus({ ok: true, msg: `Imported ${assets.length + cashPositions.length} positions. Last sync: ${res.lastSync}` });
        mutate();
      } else {
        setStatus({ ok: false, msg: res.message ?? 'Import failed' });
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message ?? 'Parse error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const lastSync = config?.ibkr_last_sync;
  const isConfigured = !!(config?.ibkr_query_id && config?.ibkr_token);

  return (
    <div className="space-y-4">
      {/* IBKR Accordion */}
      <div className="border border-base-300 rounded-box bg-base-100 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left hover:bg-base-200/50 transition-colors"
          onClick={handleOpen}
        >
          <span className="badge badge-error text-white text-xs font-bold px-2">IBKR</span>
          Interactive Brokers — Flex Query
          {isConfigured && lastSync && (
            <span className="ml-auto text-xs font-normal opacity-50">
              Last sync: {lastSync}
            </span>
          )}
          <span className={`ml-${isConfigured && lastSync ? '2' : 'auto'} transition-transform ${open ? 'rotate-180' : ''}`}>
            <FiChevronDown />
          </span>
        </button>

        {open && (
          <div className="px-5 pb-5">
            <div className="divider my-2" />

            <form onSubmit={handleSave} className="space-y-3 mb-6">
              <p className="text-sm opacity-60">
                Create a Flex Query in IBKR reporting that includes Open Positions and Cash Report.
                Enter the Query ID and Token below.
              </p>

              <div className="flex items-center gap-4">
                <label className="w-28 shrink-0 text-sm font-bold">Query ID <span className="text-error">*</span></label>
                <input
                  required
                  type="text"
                  className="input input-bordered flex-1 font-mono"
                  placeholder="e.g. 1234567"
                  value={queryId}
                  onChange={(e) => setQueryId(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="w-28 shrink-0 text-sm font-bold">Token <span className="text-error">*</span></label>
                <input
                  required
                  type="password"
                  className="input input-bordered flex-1 font-mono"
                  placeholder="Flex Query token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn btn-primary btn-sm gap-2" disabled={saving}>
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  <FiSave /> Save Credentials
                </button>

                {isConfigured && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm gap-2"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing && <span className="loading loading-spinner loading-xs" />}
                    <FiRefreshCw /> Sync Now
                  </button>
                )}
              </div>
            </form>

            <div className="divider text-xs opacity-40">or import manually</div>

            <div className="flex items-center gap-4">
              <p className="text-sm opacity-60 flex-1">
                Upload an IBKR Flex Query XML report directly to sync positions.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading && <span className="loading loading-spinner loading-xs" />}
                <FiUpload /> Upload XML
              </button>
            </div>

            {status && (
              <div className={`alert mt-4 py-2 text-sm ${status.ok ? 'alert-success' : 'alert-error'}`}>
                {status.msg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
