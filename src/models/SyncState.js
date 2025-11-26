import { getDatabase } from '../config/database.js';

export class SyncState {
  constructor(data) {
    this.id = data.id;
    this.source_id = data.source_id;
    this.sync_token = data.sync_token;
    this.etag = data.etag;
    this.last_sync = data.last_sync;
    this.last_sync_status = data.last_sync_status;
    this.last_error = data.last_error;
    this.events_count = data.events_count ?? 0;
  }

  static findBySourceId(sourceId) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM sync_state WHERE source_id = ?').get(sourceId);
    return row ? new SyncState(row) : null;
  }

  static findAll() {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT ss.*, s.name as source_name, s.type as source_type
      FROM sync_state ss
      JOIN sources s ON ss.source_id = s.id
      ORDER BY ss.last_sync DESC
    `).all();
    return rows;
  }

  static upsert(sourceId, data) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO sync_state (source_id, sync_token, etag, last_sync, last_sync_status, last_error, events_count)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        sync_token = excluded.sync_token,
        etag = excluded.etag,
        last_sync = datetime('now'),
        last_sync_status = excluded.last_sync_status,
        last_error = excluded.last_error,
        events_count = excluded.events_count
    `);

    stmt.run(
      sourceId,
      data.sync_token || null,
      data.etag || null,
      data.last_sync_status || 'pending',
      data.last_error || null,
      data.events_count ?? 0
    );

    return SyncState.findBySourceId(sourceId);
  }

  static markSuccess(sourceId, eventsCount, options = {}) {
    return SyncState.upsert(sourceId, {
      sync_token: options.sync_token,
      etag: options.etag,
      last_sync_status: 'success',
      last_error: null,
      events_count: eventsCount
    });
  }

  static markError(sourceId, error) {
    const db = getDatabase();
    const existing = SyncState.findBySourceId(sourceId);

    return SyncState.upsert(sourceId, {
      sync_token: existing?.sync_token,
      etag: existing?.etag,
      last_sync_status: 'error',
      last_error: typeof error === 'string' ? error : error.message,
      events_count: existing?.events_count ?? 0
    });
  }

  static markPending(sourceId) {
    const db = getDatabase();
    const existing = SyncState.findBySourceId(sourceId);

    return SyncState.upsert(sourceId, {
      sync_token: existing?.sync_token,
      etag: existing?.etag,
      last_sync_status: 'pending',
      last_error: null,
      events_count: existing?.events_count ?? 0
    });
  }

  toJSON() {
    return {
      id: this.id,
      source_id: this.source_id,
      sync_token: this.sync_token,
      etag: this.etag,
      last_sync: this.last_sync,
      last_sync_status: this.last_sync_status,
      last_error: this.last_error,
      events_count: this.events_count
    };
  }
}

export default SyncState;
