import { google } from 'googleapis';
import crypto from 'crypto';

// Almacen temporal de estados OAuth (en produccion usar Redis)
const pendingOAuthStates = new Map();

// Limpiar estados expirados cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingOAuthStates) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingOAuthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

/**
 * Genera la URL de autorizacion OAuth de Google Calendar
 * @param {Object} slackUser - Datos del usuario de Slack
 * @param {string} slackUser.id - ID del usuario de Slack
 * @param {string} [slackUser.teamId] - ID del workspace de Slack
 * @param {string} [slackUser.name] - Nombre del usuario
 * @param {string} [slackUser.responseUrl] - URL para actualizar mensaje de Slack
 * @param {string} [slackUser.channelId] - ID del canal de Slack
 * @returns {Object} - { url, state }
 */
export function getGoogleAuthUrl(slackUser = {}) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = process.env.GOOGLE_SCOPES
    ? process.env.GOOGLE_SCOPES.split(',').map(s => s.trim())
    : [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

  // Generar state unico con datos del usuario de Slack
  const state = crypto.randomBytes(32).toString('hex');

  // Guardar state con datos del usuario
  pendingOAuthStates.set(state, {
    slackUserId: slackUser.id,
    slackTeamId: slackUser.teamId,
    slackUserName: slackUser.name,
    responseUrl: slackUser.responseUrl,
    channelId: slackUser.channelId,
    createdAt: Date.now()
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: state
  });

  return { url, state };
}

/**
 * Valida y consume un state de OAuth
 * @param {string} state - State recibido en callback
 * @returns {Object|null} - Datos del usuario o null si invalido
 */
export function validateOAuthState(state) {
  if (!state) return null;

  const data = pendingOAuthStates.get(state);
  if (!data) return null;

  // Verificar que no haya expirado (10 minutos)
  if (Date.now() - data.createdAt > 10 * 60 * 1000) {
    pendingOAuthStates.delete(state);
    return null;
  }

  // Consumir el state (uso unico)
  pendingOAuthStates.delete(state);
  return data;
}

/**
 * Intercambia el codigo de autorizacion por tokens
 * @param {string} code - Codigo de autorizacion de Google
 * @returns {Promise<Object>} Tokens de acceso y refresh
 */
export async function exchangeCodeForTokens(code) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Obtiene informacion del perfil de Google del usuario
 * @param {string} accessToken
 * @returns {Promise<Object>} - { email, name, picture }
 */
export async function getGoogleUserInfo(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  return {
    email: data.email,
    name: data.name,
    picture: data.picture
  };
}

/**
 * Actualiza un mensaje de Slack usando el response_url
 * @param {string} responseUrl - URL de respuesta de Slack
 * @param {Array} blocks - Bloques de Slack
 * @param {string} text - Texto de fallback
 * @returns {Promise<boolean>} - true si se actualizo correctamente
 */
export async function updateSlackMessage(responseUrl, blocks, text) {
  if (!responseUrl) return false;

  try {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text,
        blocks
      })
    });

    if (!response.ok) {
      console.error('[Slack] Error updating message:', response.status, await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Slack] Error updating message:', err.message);
    return false;
  }
}
