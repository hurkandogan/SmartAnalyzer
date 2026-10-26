'use client';

import { useEffect, useState } from 'react';
import { getEarningsCalendarAction, getMacroCalendarAction } from '@/actions/screener';

interface MacroEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  type?: string;
  is_superlist?: boolean;
  is_watchlist?: boolean;
  actual?: string;
  estimate?: string;
  forecast?: string;
  prior?: string;
  previous?: string;
}

export function MacroCalendar() {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'IMPORTANT' | 'SUPERLIST' | 'OTHERS'>('ALL');

  useEffect(() => {
    async function fetchCalendar() {
      try {
        let combinedEvents: MacroEvent[] = [];

        try {
          const macroData = await getMacroCalendarAction();
          if (macroData && macroData.events) {
            combinedEvents = combinedEvents.concat(
              macroData.events.map((e: any) => ({ ...e, type: 'macro' }))
            );
          }
        } catch (e) {
          console.error('Failed to fetch macro calendar:', e);
        }

        try {
          const earningsData = await getEarningsCalendarAction();
          if (earningsData && earningsData.events) {
            combinedEvents = combinedEvents.concat(
              earningsData.events.map((e: any) => ({ ...e, type: 'earnings' }))
            );
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
  today.setHours(0, 0, 0, 0);

  const sortedEvents = [...events]
    .filter((ev) => new Date(ev.date).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const macroEvents = sortedEvents.filter((ev) => ev.type === 'macro');
  const superlistEarnings = sortedEvents.filter(
    (ev) => ev.type === 'earnings' && (ev.is_superlist || ev.is_watchlist || ev.impact === 'Superlist')
  );
  const regularEarnings = sortedEvents.filter(
    (ev) => ev.type === 'earnings' && !ev.is_superlist && !ev.is_watchlist && ev.impact !== 'Superlist'
  );

  const visibleCount =
    (filter === 'ALL' || filter === 'IMPORTANT' ? macroEvents.length : 0) +
    (filter === 'ALL' || filter === 'SUPERLIST' ? superlistEarnings.length : 0) +
    (filter === 'ALL' || filter === 'OTHERS' ? regularEarnings.length : 0);

  const renderEvent = (
    ev: MacroEvent,
    i: number,
    badgeColor: string,
    badgeLabel: string,
    isSuperlist = false
  ) => {
    const d = new Date(ev.date);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const estimateVal = ev.estimate || ev.forecast;
    const priorVal = ev.prior || ev.previous;
    const hasDetails = Boolean(ev.actual || estimateVal || priorVal);

    return (
      <div
        key={`${ev.title}-${ev.date}-${i}`}
        className={`flex items-center p-3 rounded-xl border transition-all ${
          isSuperlist
            ? 'bg-warning/10 border-warning/40 shadow-sm'
            : 'bg-base-200/50 border-base-content/5'
        }`}
      >
        <div
          className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl shrink-0 ${
            isSuperlist
              ? 'bg-warning/20 text-warning'
              : badgeColor === 'badge-error'
              ? 'bg-error/10 text-error'
              : 'bg-base-300/50 text-base-content/70'
          }`}
        >
          <span className="text-xs uppercase font-bold opacity-80">{dayName}</span>
          <span className="text-2xl font-black">{dayNum}</span>
        </div>

        <div className="ml-4 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base truncate">{ev.title}</h3>
            {isSuperlist && <span className="text-warning text-sm shrink-0">⭐</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-sm badge-outline opacity-80">{timeStr}</span>
            <span
              className={`badge badge-sm ${
                isSuperlist ? 'badge-warning font-bold' : `${badgeColor} badge-outline`
              }`}
            >
              {badgeLabel}
            </span>
          </div>

          {hasDetails && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs bg-base-300/30 p-2 rounded-lg w-fit border border-base-content/5">
              {ev.actual && (
                <div>
                  <span className="opacity-60 mr-1">Actual:</span>
                  <span className="font-bold text-primary">{ev.actual}</span>
                </div>
              )}
              {estimateVal && (
                <div>
                  <span className="opacity-60 mr-1">{ev.type === 'macro' ? 'Forecast:' : 'Est:'}</span>
                  <span className="font-bold">{estimateVal}</span>
                </div>
              )}
              {priorVal && (
                <div>
                  <span className="opacity-60 mr-1">Prior:</span>
                  <span className="font-bold">{priorVal}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="card bg-base-100 shadow-xl h-full max-h-[800px] flex flex-col">
      <div className="card-body p-6 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
          <h2 className="card-title text-xl flex items-center gap-2">
            <span>📅</span> Upcoming Events
          </h2>
          {filter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className="btn btn-ghost btn-xs text-xs opacity-70 hover:opacity-100"
            >
              Show All
            </button>
          )}
        </div>

        {/* Category count badges / quick filter buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setFilter(filter === 'IMPORTANT' ? 'ALL' : 'IMPORTANT')}
            className={`badge badge-sm py-2.5 px-3 transition-all cursor-pointer gap-1.5 ${
              filter === 'IMPORTANT'
                ? 'badge-error text-white font-bold shadow-sm'
                : 'badge-error badge-outline hover:bg-error/10'
            }`}
            title="Filter by Important Macro Events"
          >
            <span>Important:</span>
            <span className="font-bold">{macroEvents.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter(filter === 'SUPERLIST' ? 'ALL' : 'SUPERLIST')}
            className={`badge badge-sm py-2.5 px-3 transition-all cursor-pointer gap-1.5 ${
              filter === 'SUPERLIST'
                ? 'badge-warning font-bold shadow-sm'
                : 'badge-warning badge-outline hover:bg-warning/10'
            }`}
            title="Filter by Superlist Earnings"
          >
            <span>Superlist:</span>
            <span className="font-bold">{superlistEarnings.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter(filter === 'OTHERS' ? 'ALL' : 'OTHERS')}
            className={`badge badge-sm py-2.5 px-3 transition-all cursor-pointer gap-1.5 ${
              filter === 'OTHERS'
                ? 'badge-neutral font-bold shadow-sm'
                : 'badge-ghost badge-outline hover:bg-base-200'
            }`}
            title="Filter by Other Earnings"
          >
            <span>Others:</span>
            <span className="font-bold">{regularEarnings.length}</span>
          </button>
        </div>

        {sortedEvents.length === 0 ? (
          <div className="text-center opacity-70 p-4 bg-base-200 rounded-xl">
            No high impact macro data or earnings reports in the upcoming days.
          </div>
        ) : visibleCount === 0 ? (
          <div className="text-center opacity-70 p-4 bg-base-200 rounded-xl text-sm">
            No events found in this category.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
            {/* 1. Important Macro Events First */}
            {(filter === 'ALL' || filter === 'IMPORTANT') && macroEvents.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-sm text-error uppercase tracking-wider sticky top-0 bg-base-100 z-10 py-1 flex items-center gap-1.5">
                  <span>🔴</span> Important Macro Events
                </h3>
                {macroEvents.map((ev, i) => renderEvent(ev, i, 'badge-error', 'High Impact'))}
              </div>
            )}

            {/* 2. Superlist Earnings Second */}
            {(filter === 'ALL' || filter === 'SUPERLIST') && superlistEarnings.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-sm text-warning uppercase tracking-wider sticky top-0 bg-base-100 z-10 py-1 flex items-center gap-1.5">
                  <span>⭐</span> Superlist Earnings
                </h3>
                {superlistEarnings.map((ev, i) =>
                  renderEvent(ev, i, 'badge-warning', 'Superlist Earnings', true)
                )}
              </div>
            )}

            {/* 3. Other Earnings Third */}
            {(filter === 'ALL' || filter === 'OTHERS') && regularEarnings.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-sm text-base-content/60 uppercase tracking-wider sticky top-0 bg-base-100 z-10 py-1 flex items-center gap-1.5">
                  <span>📊</span> Other Earnings
                </h3>
                {regularEarnings.map((ev, i) => renderEvent(ev, i, 'badge-ghost', 'Earnings'))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
