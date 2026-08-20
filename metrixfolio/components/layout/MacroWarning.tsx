'use client';

import { useEffect, useState } from 'react';
import { db } from '@/utils/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface MacroEvent {
  title: string;
  country: string;
  date: string; // ISO format from FF API
  impact: string;
  forecast?: string;
  previous?: string;
}

export default function MacroWarning() {
  const [upcomingEvent, setUpcomingEvent] = useState<MacroEvent | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Check if user has dismissed this specific warning recently
    const dismissedUntil = localStorage.getItem('macro_warning_dismissed_until');
    if (dismissedUntil && new Date(dismissedUntil) > new Date()) {
      setIsVisible(false);
      return; // already dismissed
    }
    async function fetchCalendar() {
      try {
        const docRef = doc(db, 'screener', 'macro_calendar');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.events && Array.isArray(data.events)) {
            const now = new Date();
            const threshold = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours

            // Find the closest high-impact event within 48 hours
            const upcoming = data.events.find((ev: MacroEvent) => {
              const evDate = new Date(ev.date);
              return evDate >= now && evDate <= threshold;
            });

            if (upcoming) {
              setUpcomingEvent(upcoming);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch macro calendar:', err);
      }
    }
    fetchCalendar();
  }, []);

  if (!upcomingEvent || !isVisible) return null;

  const eventDate = new Date(upcomingEvent.date);
  const isToday = eventDate.toDateString() === new Date().toDateString();
  const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = isToday ? `Bugün ${timeStr}` : `Yarın ${timeStr}`;

  const dismissWarning = () => {
    const twelveHoursLater = new Date();
    twelveHoursLater.setHours(twelveHoursLater.getHours() + 12);
    localStorage.setItem('macro_warning_dismissed_until', twelveHoursLater.toISOString());
    setIsVisible(false);
  };

  return (
    <div className="w-full px-4 pt-4">
      <div className="max-w-7xl mx-auto bg-error/10 border border-error/20 rounded-2xl py-3 px-5 shadow-sm backdrop-blur-md flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl animate-pulse">⚠️</span>
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
            <span className="font-bold text-error">Makro Uyarı:</span>
            <span className="font-medium">{upcomingEvent.title}</span>
            <span className="opacity-80">
              ({dateStr})
            </span>
          </div>
          <span className="hidden md:inline-block text-xs opacity-70 ml-2">
            Yeni pozisyon açarken volatilite riskine (IV Spike) dikkat edin.
          </span>
        </div>
        <button 
          onClick={dismissWarning}
          className="btn btn-ghost btn-xs btn-circle text-error/80 hover:bg-error/20 ml-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
