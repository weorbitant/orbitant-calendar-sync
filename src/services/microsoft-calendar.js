import { Client } from '@microsoft/microsoft-graph-client';
import { OAuthToken } from '../models/OAuthToken.js';
import { refreshMicrosoftTokens } from '../slack/actions/microsoft-oauth.js';

/**
 * Servicio para interactuar con Microsoft Graph Calendar API
 * Soporta OAuth 2.0 con tokens de la BD
 */
class MicrosoftCalendarService {
  constructor(options = {}) {
    this.calendarId = options.calendarId || 'primary'; // 'primary' = calendario predeterminado
    this.slackUserId = options.slackUserId || null;
    this.graphClient = null;
    this.tokenRecord = null;
  }

  /**
   * Inicializa autenticacion OAuth 2.0 con tokens de la BD
   * @param {string} slackUserId - ID del usuario de Slack
   */
  async initOAuthFromDB(slackUserId) {
    this.slackUserId = slackUserId;
    console.log(`[MicrosoftCalendar] Initializing for Slack user: ${slackUserId}`);

    this.tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'microsoft');
    if (!this.tokenRecord) {
      console.error(`[MicrosoftCalendar] No tokens found for user: ${slackUserId}`);
      throw new Error(`No hay tokens OAuth de Microsoft para el usuario: ${slackUserId}`);
    }
    console.log(`[MicrosoftCalendar] Found tokens for: ${this.tokenRecord.account_email || 'unknown email'}`);

    // Verificar si el token esta expirado y refrescar si es necesario
    if (this.tokenRecord.isExpired) {
      console.log(`[MicrosoftCalendar] Token expirado, refrescando...`);
      await this._refreshTokenIfNeeded();
    }

    this._initGraphClient(this.tokenRecord.accessToken);

    return this;
  }

  /**
   * Inicializa el cliente de Microsoft Graph con un access token
   * @param {string} accessToken
   */
  _initGraphClient(accessToken) {
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  /**
   * Refresca el token si esta expirado
   */
  async _refreshTokenIfNeeded() {
    if (!this.tokenRecord || !this.tokenRecord.isExpired) {
      return;
    }

    console.log(`[MicrosoftCalendar] Refreshing tokens for user: ${this.slackUserId}`);

    try {
      const newTokens = await refreshMicrosoftTokens(this.tokenRecord.refreshToken);

      // Actualizar en la BD
      OAuthToken.updateAccessToken(
        this.slackUserId,
        newTokens.access_token,
        newTokens.expiry_date,
        'microsoft'
      );

      if (newTokens.refresh_token && newTokens.refresh_token !== this.tokenRecord.refreshToken) {
        console.log('[MicrosoftCalendar] Nuevo refresh_token recibido - actualizando BD');
        OAuthToken.updateRefreshToken(this.slackUserId, newTokens.refresh_token, 'microsoft');
      }

      // Recargar el registro de tokens
      this.tokenRecord = OAuthToken.findBySlackUserId(this.slackUserId, 'microsoft');

      // Actualizar el cliente con el nuevo token
      this._initGraphClient(newTokens.access_token);

      console.log(`[MicrosoftCalendar] Tokens refrescados exitosamente`);
    } catch (error) {
      console.error(`[MicrosoftCalendar] Error refrescando tokens:`, error.message);
      throw error;
    }
  }

  /**
   * Obtiene eventos del calendario
   * @param {Object} options - Opciones de busqueda
   * @param {Date|string} options.timeMin - Fecha inicio (default: ahora)
   * @param {Date|string} options.timeMax - Fecha fin (default: +30 dias)
   * @param {number} options.maxResults - Maximo de resultados (default: 100)
   */
  async getEvents(options = {}) {
    const now = new Date();
    const defaultTimeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const timeMin = options.timeMin ? new Date(options.timeMin).toISOString() : now.toISOString();
    const timeMax = options.timeMax ? new Date(options.timeMax).toISOString() : defaultTimeMax.toISOString();
    const maxResults = options.maxResults || 100;

    console.log(`[MicrosoftCalendar] Fetching events for user: ${this.slackUserId || 'unknown'}`);
    const startTime = Date.now();

    try {
      // Determinar el endpoint basado en calendarId
      const calendarPath = this.calendarId === 'primary'
        ? '/me/calendar/events'
        : `/me/calendars/${this.calendarId}/events`;

      const response = await this.graphClient
        .api(calendarPath)
        .select('id,subject,body,start,end,location,isAllDay,showAs,isCancelled,recurrence')
        .filter(`start/dateTime ge '${timeMin}' and end/dateTime le '${timeMax}'`)
        .top(maxResults)
        .orderby('start/dateTime')
        .get();

      const elapsed = Date.now() - startTime;
      const eventCount = response.value?.length || 0;
      console.log(`[MicrosoftCalendar] Fetched ${eventCount} events in ${elapsed}ms`);

      return {
        events: response.value || [],
        nextPageToken: response['@odata.nextLink'] || null
      };
    } catch (error) {
      await this._handleError(error);
    }
  }

  /**
   * Obtiene todos los eventos con paginacion automatica
   */
  async getAllEvents(options = {}) {
    const allEvents = [];
    const now = new Date();
    const defaultTimeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const timeMin = options.timeMin ? new Date(options.timeMin).toISOString() : now.toISOString();
    const timeMax = options.timeMax ? new Date(options.timeMax).toISOString() : defaultTimeMax.toISOString();

    try {
      // Determinar el endpoint basado en calendarId
      const calendarPath = this.calendarId === 'primary'
        ? '/me/calendar/events'
        : `/me/calendars/${this.calendarId}/events`;

      let response = await this.graphClient
        .api(calendarPath)
        .select('id,subject,body,start,end,location,isAllDay,showAs,isCancelled,recurrence')
        .filter(`start/dateTime ge '${timeMin}' and end/dateTime le '${timeMax}'`)
        .top(250) // Maximo por pagina
        .orderby('start/dateTime')
        .get();

      allEvents.push(...(response.value || []));

      // Manejar paginacion
      while (response['@odata.nextLink']) {
        response = await this.graphClient.api(response['@odata.nextLink']).get();
        allEvents.push(...(response.value || []));
      }

      return allEvents;
    } catch (error) {
      await this._handleError(error);
    }
  }

  /**
   * Obtiene un evento especifico por ID
   */
  async getEvent(eventId) {
    try {
      const calendarPath = this.calendarId === 'primary'
        ? `/me/calendar/events/${eventId}`
        : `/me/calendars/${this.calendarId}/events/${eventId}`;

      const response = await this.graphClient
        .api(calendarPath)
        .select('id,subject,body,start,end,location,isAllDay,showAs,isCancelled,recurrence')
        .get();
      return response;
    } catch (error) {
      await this._handleError(error);
    }
  }

  /**
   * Sincronizacion incremental usando delta queries
   * Util para mantener una copia local actualizada
   * @param {string|null} deltaLink - URL completa del deltaLink anterior
   */
  async syncEvents(deltaLink = null) {
    const isFullSync = !deltaLink;
    console.log(`[MicrosoftCalendar] Starting ${isFullSync ? 'full' : 'incremental'} sync for user: ${this.slackUserId || 'unknown'}`);
    const startTime = Date.now();

    try {
      const deltaEvents = [];
      let url = deltaLink;
      let newDeltaLink = null;
      let pageCount = 0;

      if (!deltaLink) {
        // Primera sincronizacion: obtener eventos desde hace 1 ano
        const timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
        const calendarPath = this.calendarId === 'primary'
          ? '/me/calendar/events/delta'
          : `/me/calendars/${this.calendarId}/events/delta`;

        url = calendarPath + `?startDateTime=${timeMin}`;
      }

      // Iterar sobre todas las paginas del delta
      while (url) {
        pageCount++;
        let response;

        if (url.startsWith('http')) {
          // Es un nextLink o deltaLink completo
          response = await this.graphClient.api(url).get();
        } else {
          // Es un path relativo
          response = await this.graphClient.api(url).get();
        }

        const pageEvents = response.value || [];
        deltaEvents.push(...pageEvents);

        if (response['@odata.nextLink']) {
          url = response['@odata.nextLink'];
          console.log(`[MicrosoftCalendar] Page ${pageCount}: ${pageEvents.length} events, fetching more...`);
        } else if (response['@odata.deltaLink']) {
          newDeltaLink = response['@odata.deltaLink'];
          url = null;
        } else {
          url = null;
        }
      }

      console.log(`[MicrosoftCalendar] Delta returned ${deltaEvents.length} events, fetching full details...`);

      // Obtener detalles completos de cada evento (delta solo devuelve campos minimos)
      const allEvents = [];
      for (const deltaEvent of deltaEvents) {
        // Eventos eliminados tienen @removed, no necesitamos obtener detalles
        if (deltaEvent['@removed']) {
          allEvents.push(deltaEvent);
          continue;
        }

        try {
          const fullEvent = await this.graphClient
            .api(`/me/events/${deltaEvent.id}`)
            .select('id,subject,body,start,end,location,isAllDay,showAs,isCancelled,recurrence')
            .get();
          allEvents.push(fullEvent);
        } catch (error) {
          // Si el evento fue eliminado entre el delta y ahora, lo marcamos como eliminado
          if (error.statusCode === 404) {
            allEvents.push({ id: deltaEvent.id, '@removed': { reason: 'deleted' } });
          } else {
            console.error(`[MicrosoftCalendar] Error fetching event ${deltaEvent.id}:`, error.message);
          }
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`[MicrosoftCalendar] Sync completed: ${allEvents.length} events in ${elapsed}ms (${pageCount} pages)`);

      return {
        events: allEvents,
        syncToken: newDeltaLink, // Guardamos deltaLink como syncToken para consistencia con Google
        fullSync: isFullSync
      };
    } catch (error) {
      // Si el deltaLink expiro, hacer full sync
      if (error.statusCode === 410) {
        console.log('[MicrosoftCalendar] deltaLink expirado, realizando full sync');
        return this.syncEvents(null);
      }
      await this._handleError(error);
    }
  }

  /**
   * Lista todos los calendarios accesibles
   */
  async listCalendars() {
    try {
      const response = await this.graphClient.api('/me/calendars').get();
      return response.value || [];
    } catch (error) {
      await this._handleError(error);
    }
  }

  /**
   * Maneja errores de Microsoft Graph API
   */
  async _handleError(error) {
    const status = error.statusCode || error.code;
    const message = error.body?.error?.message || error.message;

    // Si es error de autenticacion, intentar refrescar token
    if (status === 401 && this.tokenRecord) {
      console.log('[MicrosoftCalendar] Token invalido, intentando refrescar...');
      try {
        await this._refreshTokenIfNeeded();
        // El caller deberia reintentar la operacion
        throw new Error('Token refrescado, reintente la operacion');
      } catch (refreshError) {
        console.error('[MicrosoftCalendar] Error refrescando token:', refreshError.message);
      }
    }

    const errorMap = {
      401: 'Token invalido o expirado',
      403: 'Sin permisos para acceder al calendario',
      404: 'Calendario o evento no encontrado',
      429: 'Rate limit excedido',
      410: 'Delta link expirado'
    };

    const customMessage = errorMap[status] || message;
    console.error(`[MicrosoftCalendar] Error ${status}: ${customMessage}`);

    throw new Error(`Microsoft Graph API Error: ${customMessage}`);
  }
}

export default MicrosoftCalendarService;
