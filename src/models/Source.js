import { getDatabase } from '../config/database.js';

export class Source {
  constructor(data) {
    this.id = data.id;
    this.slack_user_id = data.slack_user_id;
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

  // ============================================
  // Metodos para consultas por usuario de Slack
  // ============================================

  /**
   * Encuentra todos los sources de un usuario de Slack
   * @param {string} slackUserId
   * @returns {Source[]}
   */
  static findBySlackUserId(slackUserId) {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM sources WHERE slack_user_id = ? ORDER BY created_at DESC'
    ).all(slackUserId);
    return rows.map(row => new Source(row));
  }

  /**
   * Encuentra un source por ID verificando propiedad del usuario
   * @param {number} id
   * @param {string} slackUserId
   * @returns {Source|null}
   */
  static findByIdAndUser(id, slackUserId) {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT * FROM sources WHERE id = ? AND slack_user_id = ?'
    ).get(id, slackUserId);
    return row ? new Source(row) : null;
  }

  /**
   * Cuenta los sources de un usuario
   * @param {string} slackUserId
   * @returns {number}
   */
  static countBySlackUserId(slackUserId) {
    const db = getDatabase();
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM sources WHERE slack_user_id = ?'
    ).get(slackUserId);
    return result.count;
  }

  /**
   * Crea un source asociado a un usuario de Slack
   * @param {Object} data
   * @param {string} slackUserId
   * @returns {Source}
   */
  static createForUser(data, slackUserId) {
    const db = getDatabase();
    const config = typeof data.config === 'object'
      ? JSON.stringify(data.config)
      : data.config;

    const stmt = db.prepare(`
      INSERT INTO sources (slack_user_id, name, type, config, enabled, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      slackUserId,
      data.name,
      data.type,
      config,
      data.enabled ?? 1,
      data.color || null
    );
    return Source.findById(result.lastInsertRowid);
  }

  /**
   * Elimina un source verificando propiedad del usuario
   * @param {number} id
   * @param {string} slackUserId
   * @returns {boolean}
   */
  static deleteForUser(id, slackUserId) {
    const db = getDatabase();
    const stmt = db.prepare(
      'DELETE FROM sources WHERE id = ? AND slack_user_id = ?'
    );
    const result = stmt.run(id, slackUserId);
    return result.changes > 0;
  }

  /**
   * Elimina todos los sources de un proveedor para un usuario
   * Util para desconectar una cuenta OAuth completa
   * @param {string} slackUserId - ID del usuario Slack
   * @param {string} provider - 'google' | 'microsoft'
   * @returns {number} - Cantidad de sources eliminados
   */
  static deleteByProviderForUser(slackUserId, provider) {
    const db = getDatabase();
    const stmt = db.prepare(
      'DELETE FROM sources WHERE slack_user_id = ? AND type = ?'
    );
    const result = stmt.run(slackUserId, provider);
    return result.changes;
  }

  /**
   * Actualiza un source verificando propiedad del usuario
   * @param {number} id
   * @param {string} slackUserId
   * @param {Object} data
   * @returns {Source|null}
   */
  static updateForUser(id, slackUserId, data) {
    // Verificar propiedad primero
    const source = Source.findByIdAndUser(id, slackUserId);
    if (!source) return null;

    return Source.update(id, data);
  }

  toJSON() {
    return {
      id: this.id,
      slack_user_id: this.slack_user_id,
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
