import { readFileSync, statSync } from 'fs';
import BaseProvider from './BaseProvider.js';
import ICAL from 'ical.js';

/**
 * Provider for local iCal files (.ics)
 */
export class ICalLocalProvider extends BaseProvider {
  constructor(source) {
    super(source);
    this.lastMtime = null;
  }

  get type() {
    return 'ical_local';
  }

  async initialize() {
    // Verify file exists
    const { path } = this.source.config;
    try {
      statSync(path);
    } catch {
      throw new Error(`iCal file not found: ${path}`);
    }
  }

  async fetchEvents(_options = {}) {
    const { path } = this.source.config;

    const stat = statSync(path);
    this.lastMtime = stat.mtime.toISOString();

    const icalData = readFileSync(path, 'utf-8');
    return this.parseICalData(icalData);
  }

  async sync(syncState) {
    const { path } = this.source.config;

    // Check if file was modified
    const stat = statSync(path);
    const currentMtime = stat.mtime.toISOString();

    if (syncState?.etag === currentMtime) {
      return {
        events: [],
        deleted: [],
        newSyncState: { etag: currentMtime },
        unchanged: true
      };
    }

    // File changed - full refresh
    const events = await this.fetchEvents();
    return {
      events,
      deleted: [],
      newSyncState: { etag: this.lastMtime },
      fullRefresh: true
    };
  }

  parseICalData(icalData) {
    const jcalData = ICAL.parse(icalData);
    const vcalendar = new ICAL.Component(jcalData);
    const vevents = vcalendar.getAllSubcomponents('vevent');

    return vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      return this.normalizeEvent(event);
    });
  }

  normalizeEvent(icalEvent) {
    const startDate = icalEvent.startDate;
    const endDate = icalEvent.endDate;

    // Determine if all-day event
    const isAllDay = startDate.isDate;

    // Format dates
    const startDateTime = isAllDay
      ? startDate.toString().split('T')[0]
      : startDate.toJSDate().toISOString();

    const endDateTime = endDate
      ? (isAllDay ? endDate.toString().split('T')[0] : endDate.toJSDate().toISOString())
      : null;

    // Get recurrence rule if present
    const rrule = icalEvent.component.getFirstPropertyValue('rrule');
    const recurrence = rrule ? rrule.toString() : null;

    return {
      source_id: this.source.id,
      external_id: icalEvent.uid || `${this.source.id}-${Date.now()}-${Math.random()}`,
      summary: icalEvent.summary || '(Sin título)',
      description: icalEvent.description || null,
      location: icalEvent.location || null,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
      all_day: isAllDay ? 1 : 0,
      status: this.mapStatus(icalEvent.component.getFirstPropertyValue('status')),
      recurrence: recurrence,
      raw_data: {
        uid: icalEvent.uid,
        summary: icalEvent.summary,
        description: icalEvent.description,
        location: icalEvent.location,
        dtstart: startDate.toString(),
        dtend: endDate?.toString(),
        rrule: recurrence
      }
    };
  }

  mapStatus(icalStatus) {
    if (!icalStatus) return 'confirmed';

    const statusMap = {
      'CONFIRMED': 'confirmed',
      'TENTATIVE': 'tentative',
      'CANCELLED': 'cancelled'
    };

    return statusMap[icalStatus.toUpperCase()] || 'confirmed';
  }
}

export default ICalLocalProvider;
