import { getDatabase } from '../config/database.js';

export class Source {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.config = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
    this.enabled = data.enabled ?? 1;
    this.color = data.color;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static findAll() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM sources ORDER BY created_at DESC').all();
    return rows.map(row => new Source(row));
  }

  static findById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    return row ? new Source(row) : null;
  }

  static findEnabled() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
    return rows.map(row => new Source(row));
  }

  static create(data) {
    const db = getDatabase();
    const config = typeof data.config === 'object' ? JSON.stringify(data.config) : data.config;

    const stmt = db.prepare(`
      INSERT INTO sources (name, type, config, enabled, color)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(data.name, data.type, config, data.enabled ?? 1, data.color);
    return Source.findById(result.lastInsertRowid);
  }

  static update(id, data) {
    const db = getDatabase();
    const updates = [];
    const values = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.config !== undefined) {
      updates.push('config = ?');
      values.push(typeof data.config === 'object' ? JSON.stringify(data.config) : data.config);
    }
    if (data.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(data.enabled);
    }
    if (data.color !== undefined) {
      updates.push('color = ?');
      values.push(data.color);
    }

    if (updates.length === 0) return Source.findById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = db.prepare(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return Source.findById(id);
  }

  static delete(id) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM sources WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      config: this.config,
      enabled: Boolean(this.enabled),
      color: this.color,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

export default Source;
