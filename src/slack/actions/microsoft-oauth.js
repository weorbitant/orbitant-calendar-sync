import { ConfidentialClientApplication } from '@azure/msal-node';
import crypto from 'crypto';

// Almacen temporal de estados OAuth (en produccion usar Redis)
const pendingMicrosoftOAuthStates = new Map();

// Limpiar estados expirados cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingMicrosoftOAuthStates) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingMicrosoftOAuthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

// Configuracion MSAL
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET
  }
};

// Instancia de ConfidentialClientApplication (lazy init)
let ccaInstance = null;

function getCCA() {
  if (!ccaInstance) {
    ccaInstance = new ConfidentialClientApplication(msalConfig);
  }
  return ccaInstance;
}

/**
 * Genera la URL de autorizacion OAuth de Microsoft/Azure
 * @param {Object} slackUser - Datos del usuario de Slack
 * @param {string} slackUser.id - ID del usuario de Slack
 * @param {string} [slackUser.teamId] - ID del workspace de Slack
 * @param {string} [slackUser.name] - Nombre del usuario
 * @returns {Promise<Object>} - { url, state }
 */
export async function getMicrosoftAuthUrl(slackUser = {}) {
  const scopes = process.env.AZURE_SCOPES
    ? process.env.AZURE_SCOPES.split(',').map(s => s.trim())
    : [
      'https://graph.microsoft.com/Calendars.Read',
      'https://graph.microsoft.com/User.Read',
      'offline_access'
    ];

  // Generar state unico con datos del usuario de Slack
  const state = crypto.randomBytes(32).toString('hex');

  // Guardar state con datos del usuario
  pendingMicrosoftOAuthStates.set(state, {
    slackUserId: slackUser.id,
    slackTeamId: slackUser.teamId,
    slackUserName: slackUser.name,
    createdAt: Date.now()
  });

  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: process.env.AZURE_REDIRECT_URI,
    state: state,
    prompt: 'consent' // Forzar consentimiento para obtener refresh_token
  };

  const cca = getCCA();
  const url = await cca.getAuthCodeUrl(authCodeUrlParameters);

  return { url, state };
}

/**
 * Valida y consume un state de OAuth de Microsoft
 * @param {string} state - State recibido en callback
 * @returns {Object|null} - Datos del usuario o null si invalido
 */
export function validateMicrosoftOAuthState(state) {
  if (!state) return null;

  const data = pendingMicrosoftOAuthStates.get(state);
  if (!data) return null;

  // Verificar que no haya expirado (10 minutos)
  if (Date.now() - data.createdAt > 10 * 60 * 1000) {
    pendingMicrosoftOAuthStates.delete(state);
    return null;
  }

  // Consumir el state (uso unico)
  pendingMicrosoftOAuthStates.delete(state);
  return data;
}

/**
 * Intercambia el codigo de autorizacion por tokens de Microsoft
 * @param {string} code - Codigo de autorizacion de Microsoft
 * @returns {Promise<Object>} Tokens de acceso y refresh
 */
export async function exchangeMicrosoftCodeForTokens(code) {
  const scopes = process.env.AZURE_SCOPES
    ? process.env.AZURE_SCOPES.split(',').map(s => s.trim())
    : [
      'https://graph.microsoft.com/Calendars.Read',
      'https://graph.microsoft.com/User.Read',
      'offline_access'
    ];

  const tokenRequest = {
    code: code,
    scopes: scopes,
    redirectUri: process.env.AZURE_REDIRECT_URI
  };

  const cca = getCCA();
  const response = await cca.acquireTokenByCode(tokenRequest);

  // MSAL devuelve un formato diferente a Google, normalizamos
  return {
    access_token: response.accessToken,
    refresh_token: response.idToken, // MSAL no siempre devuelve refresh_token directamente
    expiry_date: response.expiresOn ? response.expiresOn.getTime() : null,
    scope: response.scopes ? response.scopes.join(' ') : null,
    token_type: response.tokenType || 'Bearer',
    // Guardar datos adicionales de MSAL para refresh
    account: response.account,
    idToken: response.idToken
  };
}

/**
 * Obtiene informacion del perfil de Microsoft del usuario usando Graph API
 * @param {string} accessToken
 * @returns {Promise<Object>} - { email, name, picture }
 */
export async function getMicrosoftUserInfo(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Microsoft Graph API Error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();

  return {
    email: data.mail || data.userPrincipalName,
    name: data.displayName,
    picture: null // Microsoft Graph requiere llamada adicional para foto
  };
}

/**
 * Refresca los tokens de Microsoft usando MSAL
 * @param {string} refreshToken - Refresh token actual (no usado directamente por MSAL)
 * @param {Object} account - Account object de MSAL (si disponible)
 * @returns {Promise<Object>} Nuevos tokens
 */
export async function refreshMicrosoftTokens(refreshToken, account = null) {
  const scopes = process.env.AZURE_SCOPES
    ? process.env.AZURE_SCOPES.split(',').map(s => s.trim())
    : [
      'https://graph.microsoft.com/Calendars.Read',
      'https://graph.microsoft.com/User.Read',
      'offline_access'
    ];

  const cca = getCCA();

  // MSAL maneja el refresh internamente si hay cuenta en cache
  // Si no, necesitamos usar el refresh token directamente
  if (account) {
    try {
      const silentRequest = {
        account: account,
        scopes: scopes,
        forceRefresh: true
      };
      const response = await cca.acquireTokenSilent(silentRequest);
      return {
        access_token: response.accessToken,
        expiry_date: response.expiresOn ? response.expiresOn.getTime() : null,
        scope: response.scopes ? response.scopes.join(' ') : null,
        token_type: response.tokenType || 'Bearer'
      };
    } catch (error) {
      console.log('[MicrosoftOAuth] Silent token acquisition failed, trying refresh token');
    }
  }

  // Fallback: usar refresh token directamente via token endpoint
  const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: scopes.join(' ')
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }

  const tokens = await response.json();

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken, // Puede venir nuevo o mantener el anterior
    expiry_date: tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null,
    scope: tokens.scope,
    token_type: tokens.token_type || 'Bearer'
  };
}
