import { logger } from '../utils/logger.js';
import { getFirestore } from 'firebase-admin/firestore';

export async function runMacroCalendarSync() {
  logger.info('[Scheduler] Executing Macro Calendar Sync...');
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch macro calendar: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter for High impact USD events (Fed, CPI, NFP, etc)
    const majorEvents = data.filter(event => 
      event.country === 'USD' && 
      (event.impact === 'High' || event.title.includes('Federal Funds Rate'))
    );

    const db = getFirestore();
    await db.collection('screener').doc('macro_calendar').set({
      events: majorEvents,
      updatedAt: new Date().toISOString()
    });

    logger.info(`[MacroCalendar] Successfully synced ${majorEvents.length} high-impact USD events.`);
  } catch (error) {
    logger.error(`[MacroCalendar] Error syncing calendar: ${error.message}`);
  }
}
