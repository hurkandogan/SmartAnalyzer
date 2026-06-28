'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import { getIBKRConfigAction, syncIBKRAction } from '@/actions/ibkr';

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

export function useIBKRSync() {
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: config, mutate } = useSWR(
    user ? ['ibkr-config', user.uid] : null,
    ([, userId]) => getIBKRConfigAction(userId),
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const isConfigured = !!(config?.ibkr_query_id && config?.ibkr_token);
  const lastSync = config?.ibkr_last_sync ?? null;
  const needsSync = isConfigured && lastSync !== TODAY;

  useEffect(() => {
    if (!user || !needsSync || isSyncing) return;

    const run = async () => {
      setIsSyncing(true);
      try {
        await syncIBKRAction(user.uid);
        mutate(); // refresh config so lastSync updates
      } catch (err) {
        console.error('Auto IBKR sync failed:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    run();
  // Only run once on mount when needsSync is true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, needsSync]);

  return { isConfigured, lastSync, isSyncing };
}
