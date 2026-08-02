'use client';

import { useEffect, useState } from 'react';
import { getEarningsCalendarAction, getMacroCalendarAction } from '@/actions/screener';
import { FundamentalModal } from './FundamentalModal';

interface MacroEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  type?: string;
  is_watchlist?: boolean;
}

export function MacroCalendar() {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEventClick = (ev: MacroEvent) => {
    if (ev.type === 'earnings') {
      const parts = ev.title.split(':');
      if (parts.length > 1) {
        setSelectedSymbol(parts[1].trim().toUpperCase());
        setIsModalOpen(true);
      } else {
        setSelectedSymbol(ev.title.trim().toUpperCase());
        setIsModalOpen(true);
      }
    }
  };

  useEffect(() => {
    async function fetchCalendar() {
      try {
        let combinedEvents: MacroEvent[] = [];

        try {
          const macroData = await getMacroCalendarAction();
          if (macroData && macroData.events) {
            combinedEvents = combinedEvents.concat(macroData.events.map((e: any) => ({ ...e, type: 'macro' })));
          }
        } catch (e) {
          console.error('Failed to fetch macro calendar:', e);
        }

        try {
          const earningsData = await getEarningsCalendarAction();
          if (earningsData && earningsData.events) {
            combinedEvents = combinedEvents.concat(earningsData.events.map((e: any) => ({ ...e, type: 'earnings' })));
          }
        } catch (e) {
          console.error('Failed to fetch earnings calendar:', e);
        }

        setEvents(combinedEvents);
      } catch (err) {
        console.error('Failed to fetch calendars:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCalendar();
  }, []);

  if (loading) {
    return (
      <div className="card bg-base-100 shadow-xl p-6 mt-6 animate-pulse">
        <div className="h-6 w-48 bg-base-300 rounded mb-4"></div>
        <div className="h-32 w-full bg-base-300 rounded"></div>
      </div>
    );
  }

  // Filter out past events (keep today and future) and sort
  const today = new Date();
  today.setHours(0, 0, 0, 0); // start of today

  const sortedEvents = [...events]
    .filter(ev => new Date(ev.date).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const macroEvents = sortedEvents.filter(ev => ev.type === 'macro');
  const watchlistEarnings = sortedEvents.filter(ev => ev.type === 'earnings' && ev.is_watchlist);
  const otherEarnings = sortedEvents.filter(ev => ev.type === 'earnings' && !ev.is_watchlist);

  const renderEvent = (ev: MacroEvent, i: number, badgeColor: string, badgeLabel: string) => {
    const d = new Date(ev.date);
    const dayName = d.toLocaleDateString('tr-TR', { weekday: 'long' });
    const dayNum = d.getDate();
    const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    
    const isClickable = ev.type === 'earnings' && ev.is_watchlist;
    return (
      <div 
        key={`${ev.title}-${i}`} 
        className={`flex items-center bg-base-200/50 hover:bg-base-200 transition-colors p-3 rounded-xl border border-base-content/5 ${isClickable ? 'cursor-pointer' : ''}`}
        onClick={() => isClickable && handleEventClick(ev)}
      >
        <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl shrink-0 bg-${badgeColor.replace('badge-', '')}/10 text-${badgeColor.replace('badge-', '')}`}>
          <span className="text-xs uppercase font-bold opacity-80">{dayName.substring(0, 3)}</span>
          <span className="text-2xl font-black">{dayNum}</span>
        </div>
        
        <div className="ml-4 flex-1">
          <h3 className="font-bold text-base">{ev.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-sm badge-outline opacity-80">{timeStr}</span>
            <span className={`badge badge-sm ${badgeColor} badge-outline`}>{badgeLabel}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card bg-base-100 shadow-xl border-t-4 border-t-primary h-full max-h-[800px] flex flex-col">
      <div className="card-body p-6 flex flex-col overflow-hidden">
        <h2 className="card-title text-xl mb-4 flex items-center gap-2 shrink-0">
          <span>📅</span> Önümüzdeki Günlerin Takvimi
        </h2>

        {sortedEvents.length === 0 ? (
          <div className="text-center opacity-70 p-4 bg-base-200 rounded-xl">
            Önümüzdeki günlerde yüksek etkili bir makro veri veya şirket bilançosu bulunmuyor.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
            
            {macroEvents.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-sm text-base-content/60 uppercase tracking-wider sticky top-0 bg-base-100 z-10 py-1">Önemli Makro Veriler</h3>
                {macroEvents.map((ev, i) => renderEvent(ev, i, 'badge-error', 'High Impact'))}
              </div>
            )}

            {watchlistEarnings.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-sm text-base-content/60 uppercase tracking-wider sticky top-0 bg-base-100 z-10 py-1">İzlenen Bilançolar (Watchlist)</h3>
                {watchlistEarnings.map((ev, i) => renderEvent(ev, i, 'badge-warning', 'Önemli Bilanço'))}
              </div>
            )}

            {otherEarnings.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-sm text-base-content/60 uppercase tracking-wider sticky top-0 bg-base-100 z-10 py-1">Diğer Bilançolar</h3>
                {otherEarnings.map((ev, i) => renderEvent(ev, i, 'badge-info', 'Bilanço'))}
              </div>
            )}

          </div>
        )}
      </div>
      <FundamentalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        symbol={selectedSymbol}
      />
    </div>
  );
}
