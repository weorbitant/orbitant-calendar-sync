import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Servicio para interactuar con Google Calendar API
 * Soporta tanto OAuth 2.0 como Service Account
 */
class GoogleCalendarService {
  constructor(options = {}) {
    this.calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
    this.auth = null;
    this.calendar = null;
  }

  /**
   * Inicializa autenticación OAuth 2.0 con tokens existentes
   */
  async initOAuth(tokens = {}) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Usar tokens proporcionados o del .env
    const credentials = {
      refresh_token: tokens.refresh_token || process.env.GOOGLE_REFRESH_TOKEN,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date
    };

    if (!credentials.refresh_token) {
      throw new Error('No refresh_token disponible. Ejecuta: npm run auth');
    }

    oauth2Client.setCredentials(credentials);

    // Configurar renovación automática de tokens
    oauth2Client.on('tokens', (newTokens) => {
      console.log('[GoogleCalendar] Tokens renovados automáticamente');
      if (newTokens.refresh_token) {
        console.log('[GoogleCalendar] Nuevo refresh_token recibido - actualizar .env');
      }
    });

    this.auth = oauth2Client;
    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    return this;
  }

  /**
   * Inicializa autenticación con Service Account
   * Requiere Domain-Wide Delegation para acceder a calendarios de usuarios
   */
  async initServiceAccount(impersonateUser) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      clientOptions: {
        subject: impersonateUser || process.env.GOOGLE_IMPERSONATE_USER
      }
    });

    this.auth = await auth.getClient();
    this.calendar = google.calendar({ version: 'v3', auth: this.auth });

    return this;
  }

  /**
   * Obtiene eventos del calendario
   * @param {Object} options - Opciones de búsqueda
   * @param {Date|string} options.timeMin - Fecha inicio (default: ahora)
   * @param {Date|string} options.timeMax - Fecha fin (default: +30 días)
   * @param {number} options.maxResults - Máximo de resultados (default: 100)
   * @param {boolean} options.singleEvents - Expandir eventos recurrentes (default: true)
   * @param {string} options.orderBy - Ordenar por 'startTime' o 'updated'
   * @param {string} options.q - Búsqueda de texto libre
   */
  async getEvents(options = {}) {
    const now = new Date();
    const defaultTimeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const params = {
      calendarId: this.calendarId,
      timeMin: options.timeMin ? new Date(options.timeMin).toISOString() : now.toISOString(),
      timeMax: options.timeMax ? new Date(options.timeMax).toISOString() : defaultTimeMax.toISOString(),
      maxResults: options.maxResults || 100,
      singleEvents: options.singleEvents !== false,
      orderBy: options.orderBy || 'startTime',
      ...(options.q && { q: options.q })
    };

    try {
      const response = await this.calendar.events.list(params);
      return {
        events: response.data.items || [],
        nextPageToken: response.data.nextPageToken,
        summary: response.data.summary,
        timeZone: response.data.timeZone
      };
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Obtiene todos los eventos con paginación automática
   */
  async getAllEvents(options = {}) {
    const allEvents = [];
    let pageToken = null;

    do {
      const params = {
        calendarId: this.calendarId,
        timeMin: options.timeMin ? new Date(options.timeMin).toISOString() : new Date().toISOString(),
        timeMax: options.timeMax ? new Date(options.timeMax).toISOString() : undefined,
        maxResults: 250, // Máximo permitido por página
        singleEvents: options.singleEvents !== false,
        orderBy: options.orderBy || 'startTime',
        pageToken
      };

      const response = await this.calendar.events.list(params);
      allEvents.push(...(response.data.items || []));
      pageToken = response.data.nextPageToken;

    } while (pageToken);

    return allEvents;
  }

  /**
   * Obtiene un evento específico por ID
   */
  async getEvent(eventId) {
    try {
      const response = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId
      });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Sincronización incremental usando syncToken
   * Útil para mantener una copia local actualizada
   */
  async syncEvents(syncToken = null) {
    const params = {
      calendarId: this.calendarId,
      maxResults: 250,
      singleEvents: true
    };

    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      // Primera sincronización: obtener eventos desde hace 1 año
      params.timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const allEvents = [];
      let pageToken = null;
      let newSyncToken = null;

      do {
        const response = await this.calendar.events.list({
          ...params,
          pageToken
        });

        allEvents.push(...(response.data.items || []));
        pageToken = response.data.nextPageToken;
        newSyncToken = response.data.nextSyncToken;

      } while (pageToken);

      return {
        events: allEvents,
        syncToken: newSyncToken,
        fullSync: !syncToken
      };

    } catch (error) {
      // Si el syncToken expiró, hacer full sync
      if (error.code === 410) {
        console.log('[GoogleCalendar] syncToken expirado, realizando full sync');
        return this.syncEvents(null);
      }
      this._handleError(error);
    }
  }

  /**
   * Lista todos los calendarios accesibles
   */
  async listCalendars() {
    try {
      const response = await this.calendar.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Observa cambios en el calendario (webhook)
   * Requiere URL HTTPS pública
   */
  async watchEvents(webhookUrl, channelId, expiration) {
    try {
      const response = await this.calendar.events.watch({
        calendarId: this.calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          expiration: expiration || Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días max
        }
      });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Detiene la observación de un canal
   */
  async stopWatch(channelId, resourceId) {
    try {
      await this.calendar.channels.stop({
        requestBody: {
          id: channelId,
          resourceId
        }
      });
      return true;
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error) {
    const status = error.response?.status || error.code;
    const message = error.response?.data?.error?.message || error.message;

    const errorMap = {
      401: 'Token inválido o expirado',
      403: 'Sin permisos para acceder al calendario',
      404: 'Calendario o evento no encontrado',
      429: 'Rate limit excedido'
    };

    const customMessage = errorMap[status] || message;
    console.error(`[GoogleCalendar] Error ${status}: ${customMessage}`);

    throw new Error(`Google Calendar API Error: ${customMessage}`);
  }
}

export default GoogleCalendarService;
