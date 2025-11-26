import GoogleCalendarProvider from '../providers/GoogleCalendarProvider.js';
import ICalRemoteProvider from '../providers/ICalRemoteProvider.js';
import ICalLocalProvider from '../providers/ICalLocalProvider.js';

/**
 * Factory to create the appropriate provider for a source
 */
export function createProvider(source) {
  switch (source.type) {
  case 'google':
    return new GoogleCalendarProvider(source);
  case 'ical_remote':
    return new ICalRemoteProvider(source);
  case 'ical_local':
    return new ICalLocalProvider(source);
  default:
    throw new Error(`Unknown source type: ${source.type}`);
  }
}

/**
 * Calendar Aggregator Service
 * Coordinates multiple calendar providers and aggregates events
 */
export class CalendarAggregator {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Get or create a provider for a source
   * @param {Source} source
   * @returns {BaseProvider}
   */
  async getProvider(source) {
    const key = `${source.type}-${source.id}`;

    if (!this.providers.has(key)) {
      const provider = createProvider(source);
      await provider.initialize();
      this.providers.set(key, provider);
    }

    return this.providers.get(key);
  }

  /**
   * Clear cached provider for a source
   * @param {Source} source
   */
  clearProvider(source) {
    const key = `${source.type}-${source.id}`;
    this.providers.delete(key);
  }

  /**
   * Clear all cached providers
   */
  clearAllProviders() {
    this.providers.clear();
  }

  /**
   * Fetch events from a single source
   * @param {Source} source
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async fetchEventsFromSource(source, options = {}) {
    const provider = await this.getProvider(source);
    return provider.fetchEvents(options);
  }

  /**
   * Sync events from a single source
   * @param {Source} source
   * @param {SyncState} syncState
   * @returns {Promise<Object>}
   */
  async syncSource(source, syncState) {
    const provider = await this.getProvider(source);
    return provider.sync(syncState);
  }
}

export default CalendarAggregator;
