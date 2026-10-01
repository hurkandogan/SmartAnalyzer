'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { getUserProfileInfoAction } from '@/actions/user';

export const SyncStatusIndicator = () => {
  const { user } = useAuth();
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [statusColor, setStatusColor] = useState<'success' | 'warning' | 'error'>('warning');

  useEffect(() => {
    if (!user) return;
    
    const fetchStatus = async () => {
      try {
        const profile = await getUserProfileInfoAction(user.uid);
        if (profile?.last_updated) {
          const updateDate = new Date(profile.last_updated);
          const now = new Date();
          const diffMinutes = (now.getTime() - updateDate.getTime()) / (1000 * 60);
          
          if (diffMinutes <= 30) {
            setStatusColor('success');
          } else if (diffMinutes <= 120) {
            setStatusColor('warning');
          } else {
            setStatusColor('error');
          }

          // Format to German time (CET/CEST)
          const timeString = updateDate.toLocaleTimeString('de-DE', {
            timeZone: 'Europe/Berlin',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          setLastUpdated(timeString);
        } else {
          setStatusColor('error');
          setLastUpdated('N/A');
        }
      } catch (err) {
        console.error('Error fetching sync status:', err);
        setStatusColor('error');
        setLastUpdated('Error');
      }
    };
    
    fetchStatus();
    // Re-fetch every minute
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [user]);

  if (!lastUpdated) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-200/50 border border-base-300 shadow-inner text-xs" title="Loading sync status...">
        <span className="loading loading-spinner loading-xs opacity-50"></span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-200/50 border border-base-300 shadow-inner text-xs cursor-help transition-colors hover:bg-base-200" title="Last Sync Time (Germany)">
      <div className={`w-2 h-2 rounded-full ${
        statusColor === 'success' ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' :
        statusColor === 'warning' ? 'bg-warning shadow-[0_0_5px_rgba(234,179,8,0.5)]' :
        'bg-error shadow-[0_0_5px_rgba(239,68,68,0.5)]'
      }`} />
      <span className="font-mono font-medium opacity-80">{lastUpdated}</span>
    </div>
  );
};
