import BaseProvider from './BaseProvider.js';
import GoogleCalendarService from '../services/google-calendar.js';

/**
 * Provider for Google Calendar
 * Wraps the existing GoogleCalendarService to conform to the BaseProvider interface
 */
export class GoogleCalendarProvider extends BaseProvider {
  constructor(source) {
    super(source);
    this.service = null;
  }

  get type() {
    return 'google';
  }

  async initialize() {
    this.service = new GoogleCalendarService({
      calendarId: this.source.config?.calendarId || 'primary'
    });

    if (this.source.slack_user_id) {
      // Use OAuth tokens from database for this Slack user
      await this.service.initOAuthFromDB(this.source.slack_user_id);
    } else {
      throw new Error('Google Calendar requiere un slack_user_id para autenticación OAuth');
    }
  }

  async fetchEvents(options = {}) {
    const rawEvents = await this.service.getAllEvents(options);
    return rawEvents.map(event => this.normalizeEvent(event));
  }

  async sync(syncState) {
    const result = await this.service.syncEvents(syncState?.sync_token);

    const events = [];
    const deleted = [];

    for (const event of result.events) {
      if (event.status === 'cancelled') {
        deleted.push(event.id);
      } else {
        events.push(this.normalizeEvent(event));
      }
    }

    return {
      events,
      deleted,
      newSyncState: {
        sync_token: result.syncToken
      }
    };
  }

  normalizeEvent(rawEvent) {
    const isAllDay = !rawEvent.start?.dateTime;
    const startDateTime = rawEvent.start?.dateTime || rawEvent.start?.date;
    const endDateTime = rawEvent.end?.dateTime || rawEvent.end?.date;

    return {
      source_id: this.source.id,
      external_id: rawEvent.id,
      summary: rawEvent.summary || '(Sin título)',
      description: rawEvent.description || null,
      location: rawEvent.location || null,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
      all_day: isAllDay ? 1 : 0,
      status: rawEvent.status || 'confirmed',
      recurrence: rawEvent.recurrence ? JSON.stringify(rawEvent.recurrence) : null,
      raw_data: rawEvent
    };
  }

  supportsIncrementalSync() {
    return true;
  }

  supportsPushNotifications() {
    return true;
  }

  async watchEvents(webhookUrl, channelId) {
    return this.service.watchEvents(webhookUrl, channelId);
  }

  async stopWatch(channelId, resourceId) {
    return this.service.stopWatch(channelId, resourceId);
  }
}

export default GoogleCalendarProvider;
