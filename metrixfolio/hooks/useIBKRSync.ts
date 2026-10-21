'use client';

import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import { getIBKRConfigAction } from '@/actions/ibkr';

export function useIBKRSync() {
  const { user } = useAuth();

  // Flex Query and Gateway syncing are now performed centrally by the local backend (SmartAnalyser)
  // during Firebase sync so all positions and 3-currency metrics stay unified.
  const { data: config } = useSWR(
    user ? ['ibkr-config', user.uid] : null,
    ([, userId]) => getIBKRConfigAction(userId),
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const isConfigured = !!(config?.ibkr_query_id && config?.ibkr_token);
  const lastSync = config?.ibkr_last_sync ?? null;

  return { isConfigured, lastSync, isSyncing: false };
}
