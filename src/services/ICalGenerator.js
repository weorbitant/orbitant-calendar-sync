import ICAL from 'ical.js';
import { v4 as uuidv4 } from 'uuid';
import { Event } from '../models/Event.js';
import { Source } from '../models/Source.js';

/**
 * Service for generating iCalendar output
 */
export class ICalGenerator {
  constructor(options = {}) {
    this.prodId = options.prodId || process.env.ICAL_PRODID || '-//Calendar Service//Combined Calendar//EN';
    this.calendarName = options.calendarName || process.env.ICAL_CALENDAR_NAME || 'Combined Calendar';
  }

  /**
   * Generate iCalendar string with all events
   * @returns {string} iCalendar formatted string
   */
  generate() {
    const events = Event.findAll();
    const sources = this.getSourcesMap();

    return this.buildICalendar(events, sources);
  }

  /**
   * Generate iCalendar for specific source
   * @param {number} sourceId
   * @returns {string}
   */
  generateForSource(sourceId) {
    const events = Event.findBySourceId(sourceId);
    const source = Source.findById(sourceId);
    const sources = source ? { [source.id]: source } : {};

    return this.buildICalendar(events, sources);
  }

  /**
   * Generate iCalendar for a Slack user (all their sources, current year)
   * @param {string} slackUserId
   * @param {Object} options
   * @param {number} [options.year] - Year to filter (default: current year)
   * @returns {string}
   */
  generateForUser(slackUserId, options = {}) {
    // Get all sources for this user
    const userSources = Source.findBySlackUserId(slackUserId);
    if (!userSources.length) {
      return this.buildICalendar([], {});
    }

    // Build sources map
    const sourcesMap = userSources.reduce((map, source) => {
      map[source.id] = source;
      return map;
    }, {});

    // Calculate date range for current year
    const year = options.year || new Date().getFullYear();
    const startDate = `${year}-01-01T00:00:00.000Z`;
    const endDate = `${year}-12-31T23:59:59.999Z`;

    // Get source IDs
    const sourceIds = userSources.map(s => s.id);

    // Get events from all user sources within the year
    const events = Event.findBySourceIds(sourceIds, { startDate, endDate });

    return this.buildICalendar(events, sourcesMap);
  }

  /**
   * Get map of sources by ID
   * @returns {Object}
   */
  getSourcesMap() {
    const sources = Source.findAll();
    return sources.reduce((map, source) => {
      map[source.id] = source;
      return map;
    }, {});
  }

  /**
   * Build the iCalendar structure
   * @param {Array} events
   * @param {Object} sources
   * @returns {string}
   */
  buildICalendar(events, sources) {
    // Create vcalendar component
    const vcalendar = new ICAL.Component(['vcalendar', [], []]);

    // Set calendar properties
    vcalendar.updatePropertyWithValue('prodid', this.prodId);
    vcalendar.updatePropertyWithValue('version', '2.0');
    vcalendar.updatePropertyWithValue('calscale', 'GREGORIAN');
    vcalendar.updatePropertyWithValue('method', 'PUBLISH');
    vcalendar.updatePropertyWithValue('x-wr-calname', this.calendarName);

    // Add events
    for (const event of events) {
      const vevent = this.createVEvent(event, sources[event.source_id]);
      vcalendar.addSubcomponent(vevent);
    }

    return vcalendar.toString();
  }

  /**
   * Create a VEVENT component from an event
   * @param {Event} event
   * @param {Source} source
   * @returns {ICAL.Component}
   */
  createVEvent(event, source) {
    const vevent = new ICAL.Component('vevent');

    // UID - use external_id or generate one
    const uid = event.external_id || uuidv4();
    vevent.updatePropertyWithValue('uid', uid);

    // Summary con prefijo de fuente
    const sourcePrefix = source
      ? (source.type === 'google' ? '[Google]' : `[${source.name}]`)
      : '';
    const summary = `${sourcePrefix} ${event.summary || '(Sin título)'}`.trim();
    vevent.updatePropertyWithValue('summary', summary);

    // Description
    if (event.description) {
      vevent.updatePropertyWithValue('description', event.description);
    }

    // Location
    if (event.location) {
      vevent.updatePropertyWithValue('location', event.location);
    }

    // Start date/time
    const dtstart = this.createDateTimeProperty('dtstart', event.start_datetime, event.all_day);
    vevent.addProperty(dtstart);

    // End date/time
    if (event.end_datetime) {
      const dtend = this.createDateTimeProperty('dtend', event.end_datetime, event.all_day);
      vevent.addProperty(dtend);
    }

    // Status
    if (event.status) {
      vevent.updatePropertyWithValue('status', event.status.toUpperCase());
    }

    // Recurrence rule
    if (event.recurrence) {
      try {
        const rruleStr = event.recurrence.replace(/^RRULE:?/i, '');
        const rrule = ICAL.Recur.fromString(rruleStr);
        vevent.updatePropertyWithValue('rrule', rrule);
      } catch {
        // Skip invalid recurrence rules
        console.warn(`[ICalGenerator] Invalid recurrence rule for event ${event.id}: ${event.recurrence}`);
      }
    }

    // Timestamps
    if (event.created_at) {
      const created = ICAL.Time.fromJSDate(new Date(event.created_at), false);
      vevent.updatePropertyWithValue('created', created);
    }

    if (event.updated_at) {
      const dtstamp = ICAL.Time.fromJSDate(new Date(event.updated_at), false);
      vevent.updatePropertyWithValue('dtstamp', dtstamp);
    }

    // Custom properties for source tracking
    vevent.updatePropertyWithValue('x-source-id', String(event.source_id));
    if (source) {
      vevent.updatePropertyWithValue('x-source-name', source.name);
      vevent.updatePropertyWithValue('x-source-type', source.type);
      if (source.color) {
        vevent.updatePropertyWithValue('x-source-color', source.color);
      }
    }

    return vevent;
  }

  /**
   * Create a date/time property
   * @param {string} name - Property name (dtstart, dtend)
   * @param {string} datetime - ISO date string or date-only string
   * @param {boolean|number} allDay
   * @returns {ICAL.Property}
   */
  createDateTimeProperty(name, datetime, allDay) {
    const prop = new ICAL.Property(name);

    if (allDay) {
      // Date-only (all-day event)
      const dateStr = datetime.split('T')[0].replace(/-/g, '');
      const time = new ICAL.Time();
      time.year = parseInt(dateStr.substring(0, 4));
      time.month = parseInt(dateStr.substring(4, 6));
      time.day = parseInt(dateStr.substring(6, 8));
      time.isDate = true;
      prop.setValue(time);
    } else {
      // DateTime
      const jsDate = new Date(datetime);
      const time = ICAL.Time.fromJSDate(jsDate, false);
      prop.setValue(time);
    }

    return prop;
  }
}

// Singleton instance
let instance = null;

export function getICalGenerator(options) {
  if (!instance) {
    instance = new ICalGenerator(options);
  }
  return instance;
}

export default ICalGenerator;
