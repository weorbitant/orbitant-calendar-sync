import BaseProvider from './BaseProvider.js';
import MicrosoftCalendarService from '../services/microsoft-calendar.js';

/**
 * Provider for Microsoft Outlook Calendar
 * Wraps the MicrosoftCalendarService to conform to the BaseProvider interface
 */
export class MicrosoftCalendarProvider extends BaseProvider {
  constructor(source) {
    super(source);
    this.service = null;
  }

  get type() {
    return 'microsoft';
  }

  async initialize() {
    this.service = new MicrosoftCalendarService({
      calendarId: this.source.config?.calendarId || 'primary'
    });

    if (this.source.slack_user_id) {
      // Use OAuth tokens from database for this Slack user
      await this.service.initOAuthFromDB(this.source.slack_user_id);
    } else {
      throw new Error('MicrosoftCalendarProvider requires slack_user_id for OAuth');
    }
  }

  async fetchEvents(options = {}) {
    const rawEvents = await this.service.getAllEvents(options);
    return rawEvents.map(event => this.normalizeEvent(event));
  }

  async sync(syncState) {
    // Microsoft usa deltaLink en lugar de syncToken
    const result = await this.service.syncEvents(syncState?.sync_token);

    const events = [];
    const deleted = [];

    for (const event of result.events) {
      // Microsoft marca eventos eliminados con @removed
      if (event['@removed']) {
        deleted.push(event.id);
      } else if (event.isCancelled) {
        deleted.push(event.id);
      } else {
        events.push(this.normalizeEvent(event));
      }
    }

    return {
      events,
      deleted,
      newSyncState: {
        sync_token: result.syncToken // deltaLink guardado como sync_token
      }
    };
  }

  /**
   * Normaliza un evento de Microsoft Graph al formato unificado
   * @param {Object} rawEvent - Evento de Microsoft Graph API
   * @returns {Object} Evento normalizado
   */
  normalizeEvent(rawEvent) {
    const isAllDay = rawEvent.isAllDay === true;

    // Microsoft envia dateTime en formato: 2024-01-15T09:00:00.0000000
    // Para eventos all-day, extraemos solo la fecha
    let startDateTime = rawEvent.start?.dateTime;
    let endDateTime = rawEvent.end?.dateTime;

    if (isAllDay && startDateTime) {
      // Para eventos all-day, Microsoft envia la fecha a medianoche
      startDateTime = startDateTime.split('T')[0];
    }
    if (isAllDay && endDateTime) {
      endDateTime = endDateTime.split('T')[0];
    }

    return {
      source_id: this.source.id,
      external_id: rawEvent.id,
      summary: rawEvent.subject || '(Sin titulo)',
      description: rawEvent.body?.content || null,
      location: rawEvent.location?.displayName || null,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
      all_day: isAllDay ? 1 : 0,
      status: this._mapStatus(rawEvent),
      recurrence: rawEvent.recurrence ? JSON.stringify(rawEvent.recurrence) : null,
      raw_data: rawEvent
    };
  }

  /**
   * Mapea el estado de Microsoft al formato unificado
   * Microsoft usa showAs: free, tentative, busy, oof, workingElsewhere, unknown
   * y isCancelled para eventos cancelados
   */
  _mapStatus(rawEvent) {
    if (rawEvent.isCancelled) {
      return 'cancelled';
    }

    const showAsMap = {
      'free': 'confirmed',
      'tentative': 'tentative',
      'busy': 'confirmed',
      'oof': 'confirmed',
      'workingElsewhere': 'confirmed',
      'unknown': 'confirmed'
    };

    return showAsMap[rawEvent.showAs] || 'confirmed';
  }

  supportsIncrementalSync() {
    return true;
  }

  supportsPushNotifications() {
    return false; // No implementamos webhooks por ahora
  }
}

export default MicrosoftCalendarProvider;
