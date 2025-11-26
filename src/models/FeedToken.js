import { getDatabase } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export class FeedToken {
  constructor(data) {
    this.id = data.id;
    this.slack_user_id = data.slack_user_id;
    this.token = data.token;
    this.created_at = data.created_at;
    this.last_used_at = data.last_used_at;
  }

  /**
   * Find a feed token by its token value
   * @param {string} token
   * @returns {FeedToken|null}
   */
  static findByToken(token) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM feed_tokens WHERE token = ?').get(token);
    return row ? new FeedToken(row) : null;
  }

  /**
   * Find a feed token by Slack user ID
   * @param {string} slackUserId
   * @returns {FeedToken|null}
   */
  static findBySlackUserId(slackUserId) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM feed_tokens WHERE slack_user_id = ?').get(slackUserId);
    return row ? new FeedToken(row) : null;
  }

  /**
   * Create a new feed token for a user (or return existing)
   * @param {string} slackUserId
   * @returns {FeedToken}
   */
  static getOrCreateForUser(slackUserId) {
    const existing = FeedToken.findBySlackUserId(slackUserId);
    if (existing) {
      return existing;
    }

    const db = getDatabase();
    const token = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO feed_tokens (slack_user_id, token)
      VALUES (?, ?)
    `);

    stmt.run(slackUserId, token);
    return FeedToken.findBySlackUserId(slackUserId);
  }

  /**
   * Regenerate the token for a user
   * @param {string} slackUserId
   * @returns {FeedToken|null}
   */
  static regenerateToken(slackUserId) {
    const db = getDatabase();
    const newToken = uuidv4();

    const stmt = db.prepare(`
      UPDATE feed_tokens
      SET token = ?, created_at = datetime('now'), last_used_at = NULL
      WHERE slack_user_id = ?
    `);

    const result = stmt.run(newToken, slackUserId);

    if (result.changes === 0) {
      // No existing token, create new one
      return FeedToken.getOrCreateForUser(slackUserId);
    }

    return FeedToken.findBySlackUserId(slackUserId);
  }

  /**
   * Update the last_used_at timestamp
   * @param {string} token
   */
  static updateLastUsed(token) {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE feed_tokens
      SET last_used_at = datetime('now')
      WHERE token = ?
    `);
    stmt.run(token);
  }

  /**
   * Delete a feed token for a user
   * @param {string} slackUserId
   * @returns {boolean}
   */
  static delete(slackUserId) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM feed_tokens WHERE slack_user_id = ?');
    const result = stmt.run(slackUserId);
    return result.changes > 0;
  }

  toJSON() {
    return {
      id: this.id,
      slack_user_id: this.slack_user_id,
      token: this.token,
      created_at: this.created_at,
      last_used_at: this.last_used_at
    };
  }
}

export default FeedToken;
