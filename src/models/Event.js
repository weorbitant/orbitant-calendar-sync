import { getDatabase } from '../config/database.js';

export class Event {
  constructor(data) {
    this.id = data.id;
    this.source_id = data.source_id;
    this.external_id = data.external_id;
    this.summary = data.summary;
    this.description = data.description;
    this.location = data.location;
    this.start_datetime = data.start_datetime;
    this.end_datetime = data.end_datetime;
    this.all_day = data.all_day ?? 0;
    this.status = data.status;
    this.recurrence = data.recurrence;
    this.raw_data = typeof data.raw_data === 'string' ? JSON.parse(data.raw_data) : data.raw_data;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static findAll() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM events ORDER BY start_datetime ASC').all();
    return rows.map(row => new Event(row));
  }

  static findBySourceId(sourceId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM events WHERE source_id = ? ORDER BY start_datetime ASC').all(sourceId);
    return rows.map(row => new Event(row));
  }

  static findById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    return row ? new Event(row) : null;
  }

  static findByExternalId(sourceId, externalId) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM events WHERE source_id = ? AND external_id = ?').get(sourceId, externalId);
    return row ? new Event(row) : null;
  }

  static upsert(data) {
    const db = getDatabase();
    const rawData = typeof data.raw_data === 'object' ? JSON.stringify(data.raw_data) : data.raw_data;

    const stmt = db.prepare(`
      INSERT INTO events (source_id, external_id, summary, description, location, start_datetime, end_datetime, all_day, status, recurrence, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, external_id) DO UPDATE SET
        summary = excluded.summary,
        description = excluded.description,
        location = excluded.location,
        start_datetime = excluded.start_datetime,
        end_datetime = excluded.end_datetime,
        all_day = excluded.all_day,
        status = excluded.status,
        recurrence = excluded.recurrence,
        raw_data = excluded.raw_data,
        updated_at = datetime('now')
    `);

    const result = stmt.run(
      data.source_id,
      data.external_id,
      data.summary,
      data.description,
      data.location,
      data.start_datetime,
      data.end_datetime,
      data.all_day ?? 0,
      data.status,
      data.recurrence,
      rawData
    );

    return Event.findByExternalId(data.source_id, data.external_id);
  }

  static bulkUpsert(events) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO events (source_id, external_id, summary, description, location, start_datetime, end_datetime, all_day, status, recurrence, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, external_id) DO UPDATE SET
        summary = excluded.summary,
        description = excluded.description,
        location = excluded.location,
        start_datetime = excluded.start_datetime,
        end_datetime = excluded.end_datetime,
        all_day = excluded.all_day,
        status = excluded.status,
        recurrence = excluded.recurrence,
        raw_data = excluded.raw_data,
        updated_at = datetime('now')
    `);

    const upsertMany = db.transaction((events) => {
      for (const data of events) {
        const rawData = typeof data.raw_data === 'object' ? JSON.stringify(data.raw_data) : data.raw_data;
        stmt.run(
          data.source_id,
          data.external_id,
          data.summary,
          data.description,
          data.location,
          data.start_datetime,
          data.end_datetime,
          data.all_day ?? 0,
          data.status,
          data.recurrence,
          rawData
        );
      }
    });

    upsertMany(events);
    return events.length;
  }

  static deleteBySourceId(sourceId) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM events WHERE source_id = ?');
    const result = stmt.run(sourceId);
    return result.changes;
  }

  static deleteByExternalIds(sourceId, externalIds) {
    if (!externalIds.length) return 0;

    const db = getDatabase();
    const placeholders = externalIds.map(() => '?').join(',');
    const stmt = db.prepare(`DELETE FROM events WHERE source_id = ? AND external_id IN (${placeholders})`);
    const result = stmt.run(sourceId, ...externalIds);
    return result.changes;
  }

  toJSON() {
    return {
      id: this.id,
      source_id: this.source_id,
      external_id: this.external_id,
      summary: this.summary,
      description: this.description,
      location: this.location,
      start_datetime: this.start_datetime,
      end_datetime: this.end_datetime,
      all_day: Boolean(this.all_day),
      status: this.status,
      recurrence: this.recurrence,
      raw_data: this.raw_data,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

export default Event;
