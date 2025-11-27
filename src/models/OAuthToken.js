import { getDatabase } from '../config/database.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

export class OAuthToken {
  constructor(data) {
    this.id = data.id;
    this.slack_user_id = data.slack_user_id;
    this.slack_team_id = data.slack_team_id;
    this.slack_user_name = data.slack_user_name;
    this.provider = data.provider || 'google';
    this.token_type = data.token_type || 'Bearer';
    this.scope = data.scope;
    this.expires_at = data.expires_at;
    this.account_email = data.account_email;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;

    // Tokens encriptados (no expuestos directamente)
    this._access_token_encrypted = data.access_token_encrypted;
    this._refresh_token_encrypted = data.refresh_token_encrypted;
  }

  /**
   * Obtiene el access_token desencriptado
   */
  get accessToken() {
    if (!this._access_token_encrypted) return null;
    try {
      return decrypt(this._access_token_encrypted, ENCRYPTION_KEY);
    } catch (error) {
      console.error('[OAuthToken] Error desencriptando access_token:', error.message);
      return null;
    }
  }

  /**
   * Obtiene el refresh_token desencriptado
   */
  get refreshToken() {
    if (!this._refresh_token_encrypted) return null;
    try {
      return decrypt(this._refresh_token_encrypted, ENCRYPTION_KEY);
    } catch (error) {
      console.error('[OAuthToken] Error desencriptando refresh_token:', error.message);
      return null;
    }
  }

  /**
   * Verifica si el access_token ha expirado
   */
  get isExpired() {
    if (!this.expires_at) return true;
    // Considerar expirado 5 minutos antes para evitar race conditions
    return Date.now() >= (this.expires_at - 5 * 60 * 1000);
  }

  /**
   * Retorna tokens en formato compatible con googleapis
   */
  toGoogleCredentials() {
    return {
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      expiry_date: this.expires_at,
      token_type: this.token_type,
      scope: this.scope
    };
  }

  // ============ Static Methods ============

  /**
   * Busca tokens por slack_user_id
   */
  static findBySlackUserId(slackUserId, provider = 'google') {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT * FROM oauth_tokens WHERE slack_user_id = ? AND provider = ?'
    ).get(slackUserId, provider);
    return row ? new OAuthToken(row) : null;
  }

  /**
   * Busca todos los tokens de un usuario (todos los proveedores)
   */
  static findAllBySlackUserId(slackUserId) {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM oauth_tokens WHERE slack_user_id = ?'
    ).all(slackUserId);
    return rows.map(row => new OAuthToken(row));
  }

  /**
   * Verifica si un usuario tiene tokens validos
   */
  static hasValidTokens(slackUserId, provider = 'google') {
    const token = OAuthToken.findBySlackUserId(slackUserId, provider);
    return token !== null && token.refreshToken !== null;
  }

  /**
   * Guarda o actualiza tokens para un usuario
   */
  static upsert(data) {
    const db = getDatabase();

    // Encriptar tokens
    const accessTokenEncrypted = data.access_token
      ? encrypt(data.access_token, ENCRYPTION_KEY)
      : null;
    const refreshTokenEncrypted = data.refresh_token
      ? encrypt(data.refresh_token, ENCRYPTION_KEY)
      : null;

    const stmt = db.prepare(`
      INSERT INTO oauth_tokens (
        slack_user_id, slack_team_id, slack_user_name, provider,
        access_token_encrypted, refresh_token_encrypted,
        token_type, scope, expires_at, account_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slack_user_id, provider) DO UPDATE SET
        slack_team_id = excluded.slack_team_id,
        slack_user_name = excluded.slack_user_name,
        access_token_encrypted = COALESCE(excluded.access_token_encrypted, oauth_tokens.access_token_encrypted),
        refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, oauth_tokens.refresh_token_encrypted),
        token_type = excluded.token_type,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        account_email = COALESCE(excluded.account_email, oauth_tokens.account_email),
        updated_at = datetime('now')
    `);

    stmt.run(
      data.slack_user_id,
      data.slack_team_id || null,
      data.slack_user_name || null,
      data.provider || 'google',
      accessTokenEncrypted,
      refreshTokenEncrypted,
      data.token_type || 'Bearer',
      data.scope || null,
      data.expires_at || null,
      data.account_email || null
    );

    return OAuthToken.findBySlackUserId(data.slack_user_id, data.provider || 'google');
  }

  /**
   * Actualiza solo el access_token (despues de renovacion)
   */
  static updateAccessToken(slackUserId, accessToken, expiresAt, provider = 'google') {
    const db = getDatabase();
    const accessTokenEncrypted = encrypt(accessToken, ENCRYPTION_KEY);

    const stmt = db.prepare(`
      UPDATE oauth_tokens
      SET access_token_encrypted = ?, expires_at = ?, updated_at = datetime('now')
      WHERE slack_user_id = ? AND provider = ?
    `);

    stmt.run(accessTokenEncrypted, expiresAt, slackUserId, provider);
    return OAuthToken.findBySlackUserId(slackUserId, provider);
  }

  /**
   * Actualiza refresh_token (cuando Google emite uno nuevo)
   */
  static updateRefreshToken(slackUserId, refreshToken, provider = 'google') {
    const db = getDatabase();
    const refreshTokenEncrypted = encrypt(refreshToken, ENCRYPTION_KEY);

    const stmt = db.prepare(`
      UPDATE oauth_tokens
      SET refresh_token_encrypted = ?, updated_at = datetime('now')
      WHERE slack_user_id = ? AND provider = ?
    `);

    stmt.run(refreshTokenEncrypted, slackUserId, provider);
    return OAuthToken.findBySlackUserId(slackUserId, provider);
  }

  /**
   * Elimina tokens de un usuario
   */
  static delete(slackUserId, provider = 'google') {
    const db = getDatabase();
    const stmt = db.prepare(
      'DELETE FROM oauth_tokens WHERE slack_user_id = ? AND provider = ?'
    );
    const result = stmt.run(slackUserId, provider);
    return result.changes > 0;
  }

  /**
   * Lista todos los usuarios con tokens (para admin, sin tokens sensibles)
   */
  static findAll() {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT id, slack_user_id, slack_user_name, provider, account_email,
              expires_at, created_at, updated_at
       FROM oauth_tokens ORDER BY created_at DESC`
    ).all();
    return rows;
  }

  toJSON() {
    return {
      id: this.id,
      slack_user_id: this.slack_user_id,
      slack_user_name: this.slack_user_name,
      provider: this.provider,
      account_email: this.account_email,
      is_expired: this.isExpired,
      expires_at: this.expires_at,
      created_at: this.created_at,
      updated_at: this.updated_at
      // No incluir tokens por seguridad
    };
  }
}

export default OAuthToken;
