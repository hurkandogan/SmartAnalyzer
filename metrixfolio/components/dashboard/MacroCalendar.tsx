'use client';

import { useEffect, useState } from 'react';
import { db } from '@/utils/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface MacroEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
}

export function MacroCalendar() {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCalendar() {
      try {
        const docRef = doc(db, 'screener', 'macro_calendar');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.events) {
            setEvents(data.events);
          }
        }
      } catch (err) {
        console.error('Failed to fetch macro calendar:', err);
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

  // Apple-like vertical or horizontal list for this week's events
  const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="card bg-base-100 shadow-xl border-t-4 border-t-primary h-full">
      <div className="card-body p-6">
        <h2 className="card-title text-xl mb-4 flex items-center gap-2">
          <span>📅</span> Hafta İçi Önemli Makro Gelişmeler
        </h2>

        {sortedEvents.length === 0 ? (
          <div className="text-center opacity-70 p-4 bg-base-200 rounded-xl">
            Bu hafta için yüksek etkili bir ABD makro verisi bulunmuyor.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedEvents.map((ev, i) => {
              const d = new Date(ev.date);
              const dayName = d.toLocaleDateString('tr-TR', { weekday: 'long' });
              const dayNum = d.getDate();
              const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              
              return (
                <div key={i} className="flex items-center bg-base-200/50 hover:bg-base-200 transition-colors p-3 rounded-xl border border-base-content/5">
                  <div className="flex flex-col items-center justify-center w-16 h-16 bg-primary/10 text-primary rounded-xl shrink-0">
                    <span className="text-xs uppercase font-bold opacity-80">{dayName.substring(0, 3)}</span>
                    <span className="text-2xl font-black">{dayNum}</span>
                  </div>
                  
                  <div className="ml-4 flex-1">
                    <h3 className="font-bold text-base">{ev.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="badge badge-sm badge-outline opacity-80">{timeStr}</span>
                      {ev.impact === 'High' && (
                        <span className="badge badge-sm badge-error badge-outline">High Impact</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
