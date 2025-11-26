import { Source } from '../models/Source.js';
import { Event } from '../models/Event.js';
import { SyncState } from '../models/SyncState.js';
import { CalendarAggregator } from './CalendarAggregator.js';

/**
 * Service for synchronizing calendar sources
 */
export class SyncService {
  constructor() {
    this.aggregator = new CalendarAggregator();
    this.syncing = false;
  }

  /**
   * Sync all enabled sources
   * @returns {Promise<Object>} Summary of sync results
   */
  async syncAll() {
    if (this.syncing) {
      console.log('[SyncService] Sync already in progress, skipping');
      return { skipped: true, reason: 'Sync already in progress' };
    }

    this.syncing = true;
    const results = {
      success: [],
      failed: [],
      startedAt: new Date().toISOString()
    };

    try {
      const sources = Source.findEnabled();
      console.log(`[SyncService] Starting sync for ${sources.length} sources`);

      for (const source of sources) {
        try {
          const result = await this.syncSource(source.id);
          results.success.push({
            sourceId: source.id,
            sourceName: source.name,
            eventsCount: result.eventsCount,
            unchanged: result.unchanged
          });
        } catch (error) {
          console.error(`[SyncService] Failed to sync source ${source.id}:`, error.message);
          results.failed.push({
            sourceId: source.id,
            sourceName: source.name,
            error: error.message
          });
        }
      }

      results.completedAt = new Date().toISOString();
      console.log(`[SyncService] Sync completed: ${results.success.length} success, ${results.failed.length} failed`);

      return results;
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync a single source by ID
   * @param {number} sourceId
   * @returns {Promise<Object>}
   */
  async syncSource(sourceId) {
    const source = Source.findById(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    if (!source.enabled) {
      throw new Error(`Source is disabled: ${sourceId}`);
    }

    console.log(`[SyncService] Syncing source: ${source.name} (${source.type})`);

    // Mark as pending
    SyncState.markPending(sourceId);

    try {
      // Get current sync state
      const syncState = SyncState.findBySourceId(sourceId);

      // Perform sync
      const result = await this.aggregator.syncSource(source, syncState);

      // Handle unchanged response (ETag/mtime match)
      if (result.unchanged) {
        console.log(`[SyncService] Source ${source.name} unchanged`);
        SyncState.markSuccess(sourceId, syncState?.events_count || 0, {
          sync_token: result.newSyncState?.sync_token,
          etag: result.newSyncState?.etag
        });
        return { unchanged: true, eventsCount: syncState?.events_count || 0 };
      }

      // Handle full refresh (delete all and re-insert)
      if (result.fullRefresh) {
        Event.deleteBySourceId(sourceId);
      }

      // Handle deleted events (for incremental sync)
      if (result.deleted?.length > 0) {
        Event.deleteByExternalIds(sourceId, result.deleted);
      }

      // Upsert events
      if (result.events?.length > 0) {
        Event.bulkUpsert(result.events);
      }

      // Count total events for this source
      const totalEvents = Event.findBySourceId(sourceId).length;

      // Mark success
      SyncState.markSuccess(sourceId, totalEvents, {
        sync_token: result.newSyncState?.sync_token,
        etag: result.newSyncState?.etag
      });

      console.log(`[SyncService] Source ${source.name} synced: ${totalEvents} events`);

      return {
        unchanged: false,
        eventsCount: totalEvents,
        newEvents: result.events?.length || 0,
        deletedEvents: result.deleted?.length || 0
      };
    } catch (error) {
      SyncState.markError(sourceId, error);
      throw error;
    }
  }

  /**
   * Get sync status for all sources
   * @returns {Array}
   */
  getSyncStatus() {
    return SyncState.findAll();
  }

  /**
   * Force full resync for a source (clears sync tokens)
   * @param {number} sourceId
   * @returns {Promise<Object>}
   */
  async forceResync(sourceId) {
    const source = Source.findById(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    // Clear sync state to force full sync
    SyncState.upsert(sourceId, {
      sync_token: null,
      etag: null,
      last_sync_status: 'pending'
    });

    // Clear cached provider
    this.aggregator.clearProvider(source);

    // Delete all events for this source
    Event.deleteBySourceId(sourceId);

    // Perform sync
    return this.syncSource(sourceId);
  }
}

// Singleton instance
let instance = null;

export function getSyncService() {
  if (!instance) {
    instance = new SyncService();
  }
  return instance;
}

export default SyncService;
