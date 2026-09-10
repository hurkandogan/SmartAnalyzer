'use client';

import { useEffect, useState } from 'react';
import { db } from '@/utils/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface MacroEvent {
  title: string;
  country: string;
  date: string; // ISO format from FF API
  impact: string;
  actual?: string;
  estimate?: string;
  prior?: string;
}

export default function MacroWarning() {
  const [upcomingEvent, setUpcomingEvent] = useState<MacroEvent | null>(null);
  const [announcedEvent, setAnnouncedEvent] = useState<MacroEvent | null>(null);

  useEffect(() => {
    async function fetchCalendar() {
      try {
        const docRef = doc(db, 'screener', 'macro_calendar');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.events && Array.isArray(data.events)) {
            const now = new Date();
            const upcomingThreshold = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours
            const pastThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours

            // Find closest upcoming event
            let upcoming = data.events.find((ev: MacroEvent) => {
              const evDate = new Date(ev.date);
              return evDate >= now && evDate <= upcomingThreshold;
            });
            
            if (upcoming) {
              const dismissedUntil = localStorage.getItem('macro_warning_upcoming_dismissed_until');
              if (dismissedUntil && new Date(dismissedUntil) > now) {
                upcoming = null;
              }
            }

            // Find recent announced event (has 'actual' and is within last 24h)
            let announced = data.events.find((ev: MacroEvent) => {
              const evDate = new Date(ev.date);
              return ev.actual && evDate <= now && evDate >= pastThreshold;
            });
            
            if (announced) {
              const isDismissed = localStorage.getItem(`macro_warning_announced_dismissed_${announced.title}`);
              if (isDismissed) {
                announced = null;
              }
            }

            if (upcoming) setUpcomingEvent(upcoming);
            if (announced) setAnnouncedEvent(announced);
          }
        }
      } catch (err) {
        console.error('Failed to fetch macro calendar:', err);
      }
    }
    fetchCalendar();
  }, []);

  if (!upcomingEvent && !announcedEvent) return null;

  const dismissUpcoming = () => {
    const twelveHoursLater = new Date();
    twelveHoursLater.setHours(twelveHoursLater.getHours() + 12);
    localStorage.setItem('macro_warning_upcoming_dismissed_until', twelveHoursLater.toISOString());
    setUpcomingEvent(null);
  };

  const dismissAnnounced = () => {
    if (announcedEvent) {
      localStorage.setItem(`macro_warning_announced_dismissed_${announcedEvent.title}`, 'true');
      setAnnouncedEvent(null);
    }
  };

  const renderUpcoming = () => {
    if (!upcomingEvent) return null;
    const eventDate = new Date(upcomingEvent.date);
    const isToday = eventDate.toDateString() === new Date().toDateString();
    const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = isToday ? `Today ${timeStr}` : `Tomorrow ${timeStr}`;

    return (
      <div className="flex items-center gap-3">
        <span className="text-xl animate-pulse">⚠️</span>
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
          <span className="font-bold text-error">Macro Warning:</span>
          <span className="font-medium">{upcomingEvent.title}</span>
          <span className="opacity-80">({dateStr})</span>
        </div>
        <span className="hidden md:inline-block text-xs opacity-70 ml-2">
          Be cautious of volatility risk (IV Spike) when opening new positions.
        </span>
      </div>
    );
  };

  const renderAnnounced = () => {
    if (!announcedEvent) return null;
    
    return (
      <div className="flex items-center gap-3 w-full md:w-auto">
        <span className="text-xl">📢</span>
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
          <span className="font-bold text-primary">Result Announced:</span>
          <span className="font-medium">{announcedEvent.title}</span>
        </div>
        <div className="flex gap-3 text-xs bg-base-100/50 px-3 py-1 rounded-lg ml-2">
          {announcedEvent.actual && <div><span className="opacity-60">Actual:</span> <span className="font-bold text-primary">{announcedEvent.actual}</span></div>}
          {announcedEvent.estimate && <div><span className="opacity-60">Est:</span> <span className="font-bold">{announcedEvent.estimate}</span></div>}
          {announcedEvent.prior && <div><span className="opacity-60">Prior:</span> <span className="font-bold">{announcedEvent.prior}</span></div>}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full px-4 pt-2 flex flex-col gap-2">
      {announcedEvent && (
        <div className="max-w-7xl w-full mx-auto bg-primary/10 border border-primary/20 rounded-2xl py-3 px-5 shadow-sm backdrop-blur-md flex items-center justify-between text-sm">
          {renderAnnounced()}
          <button onClick={dismissAnnounced} className="btn btn-ghost btn-xs btn-circle text-primary/80 hover:bg-primary/20 ml-2">✕</button>
        </div>
      )}
      
      {upcomingEvent && (
        <div className="max-w-7xl w-full mx-auto bg-error/10 border border-error/20 rounded-2xl py-3 px-5 shadow-sm backdrop-blur-md flex items-center justify-between text-sm">
          {renderUpcoming()}
          <button onClick={dismissUpcoming} className="btn btn-ghost btn-xs btn-circle text-error/80 hover:bg-error/20 ml-2">✕</button>
        </div>
      )}
    </div>
  );
}
