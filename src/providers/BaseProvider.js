/**
 * Abstract base class for calendar providers
 * All calendar providers must extend this class and implement its methods
 */
export class BaseProvider {
  constructor(source) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    this.source = source;
  }

  /**
   * Get provider type identifier
   * @returns {string}
   */
  get type() {
    throw new Error('type getter must be implemented');
  }

  /**
   * Initialize the provider (authenticate, connect, etc.)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented');
  }

  /**
   * Fetch all events from the source
   * @param {Object} options - Fetch options
   * @returns {Promise<Array>} Array of normalized events
   */
  async fetchEvents(_options = {}) {
    throw new Error('fetchEvents() must be implemented');
  }

  /**
   * Perform incremental sync if supported
   * @param {Object} syncState - Previous sync state
   * @returns {Promise<Object>} Object containing { events, deleted, newSyncState }
   */
  async sync(_syncState) {
    // Default: full fetch (providers can override for incremental sync)
    const events = await this.fetchEvents();
    return {
      events,
      deleted: [],
      newSyncState: {}
    };
  }

  /**
   * Normalize a raw event to the common format
   * @param {Object} rawEvent - Raw event from the provider
   * @returns {Object} Normalized event
   */
  normalizeEvent(_rawEvent) {
    throw new Error('normalizeEvent() must be implemented');
  }

  /**
   * Check if the provider supports incremental sync
   * @returns {boolean}
   */
  supportsIncrementalSync() {
    return false;
  }

  /**
   * Check if the provider supports push notifications
   * @returns {boolean}
   */
  supportsPushNotifications() {
    return false;
  }
}

export default BaseProvider;
