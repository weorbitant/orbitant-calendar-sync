import BaseProvider from './BaseProvider.js';
import ICAL from 'ical.js';

/**
 * Provider for remote iCal URLs (HTTP/HTTPS)
 */
export class ICalRemoteProvider extends BaseProvider {
  constructor(source) {
    super(source);
    this.lastEtag = null;
  }

  get type() {
    return 'ical_remote';
  }

  async initialize() {
    // No initialization needed for remote iCal
  }

  async fetchEvents(options = {}) {
    const { url, headers = {}, timeout = 30000 } = this.source.config;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/calendar',
          ...headers
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.lastEtag = response.headers.get('etag');
      const icalData = await response.text();

      return this.parseICalData(icalData);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async sync(syncState) {
    const { url, headers = {}, timeout = 30000 } = this.source.config;

    // Try conditional fetch with ETag
    if (syncState?.etag) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'text/calendar',
            'If-None-Match': syncState.etag,
            ...headers
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Not modified - no changes
        if (response.status === 304) {
          return {
            events: [],
            deleted: [],
            newSyncState: { etag: syncState.etag },
            unchanged: true
          };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const newEtag = response.headers.get('etag');
        const icalData = await response.text();
        const events = this.parseICalData(icalData);

        return {
          events,
          deleted: [],
          newSyncState: { etag: newEtag },
          fullRefresh: true
        };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }
    }

    // No ETag available - full fetch
    const events = await this.fetchEvents();
    return {
      events,
      deleted: [],
      newSyncState: { etag: this.lastEtag },
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

export default ICalRemoteProvider;
