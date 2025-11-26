import { google } from 'googleapis';

/**
 * Genera la URL de autorización OAuth de Google Calendar
 * @returns {string} URL de autorización
 */
export function getGoogleAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = process.env.GOOGLE_SCOPES
    ? process.env.GOOGLE_SCOPES.split(',').map(s => s.trim())
    : ['https://www.googleapis.com/auth/calendar.readonly'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

/**
 * Intercambia el código de autorización por tokens
 * @param {string} code - Código de autorización de Google
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
