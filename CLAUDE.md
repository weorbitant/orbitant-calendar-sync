# CLAUDE.md - Unified Calendar Service

## Visión General

Servicio Node.js para sincronizar eventos de calendarios de **Google Calendar** y **Microsoft Outlook** mediante OAuth 2.0, con una capa de abstracción unificada que permite trabajar con ambos proveedores de forma transparente.

### Objetivos

- Autenticación OAuth 2.0 para ambos proveedores (con consentimiento del usuario)
- Sincronización incremental eficiente (solo cambios)
- API REST unificada independiente del proveedor
- Soporte para webhooks/subscriptions en tiempo real
- Arquitectura extensible para añadir más proveedores en el futuro
- Cloud-independent: desplegable en cualquier infraestructura

### Stack Tecnológico

- **Runtime**: Node.js 20+ (ESM modules)
- **Framework**: Express.js
- **Google**: googleapis
- **Microsoft**: @azure/msal-node + @microsoft/microsoft-graph-client
- **Base de datos**: SQLite (desarrollo) / PostgreSQL (producción)
- **Cache**: Redis (opcional, para tokens y sync state)

---

## Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│                        API REST Layer                          │
│                     GET /api/events, etc.                      │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                   CalendarManager                               │
│         (Orquesta múltiples proveedores por usuario)           │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│               ICalendarProvider (Interface)                     │
│  ┌─────────────────────┐     ┌─────────────────────┐          │
│  │  GoogleCalendar     │     │  MicrosoftCalendar  │          │
│  │     Provider        │     │      Provider       │          │
│  └─────────────────────┘     └─────────────────────┘          │
└────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                    Data Layer                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Tokens    │  │   Events    │  │ Sync State  │            │
│  │   Store     │  │    Store    │  │   Store     │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└────────────────────────────────────────────────────────────────┘
```

---

## Estructura del Proyecto

```
unified-calendar-service/
├── CLAUDE.md                      # Este archivo
├── README.md                      # Documentación de uso
├── package.json
├── .env.example
├── .gitignore
│
├── src/
│   ├── index.js                   # Entry point, servidor Express
│   ├── config/
│   │   └── index.js               # Configuración centralizada
│   │
│   ├── providers/                 # Implementaciones por proveedor
│   │   ├── base-provider.js       # Clase base abstracta
│   │   ├── google/
│   │   │   ├── google-provider.js
│   │   │   ├── google-auth.js
│   │   │   └── google-mapper.js   # Mapea eventos Google → formato unificado
│   │   └── microsoft/
│   │       ├── microsoft-provider.js
│   │       ├── microsoft-auth.js
│   │       └── microsoft-mapper.js
│   │
│   ├── core/
│   │   ├── calendar-manager.js    # Orquestador principal
│   │   ├── interfaces.js          # Definición de interfaces/tipos
│   │   └── errors.js              # Errores personalizados
│   │
│   ├── routes/
│   │   ├── auth.routes.js         # OAuth flows
│   │   ├── calendar.routes.js     # API de calendarios
│   │   ├── events.routes.js       # API de eventos
│   │   └── webhook.routes.js      # Receivers de notificaciones
│   │
│   ├── stores/                    # Persistencia
│   │   ├── token-store.js         # Almacén de tokens OAuth
│   │   ├── event-store.js         # Cache de eventos
│   │   └── sync-store.js          # Estado de sincronización
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js     # Validación de sesión/API key
│   │   └── error.middleware.js    # Manejo global de errores
│   │
│   └── utils/
│       ├── logger.js
│       └── date-utils.js
│
├── scripts/
│   ├── setup-google.js            # Guía interactiva config Google
│   ├── setup-microsoft.js         # Guía interactiva config Microsoft
│   └── sync-all.js                # Script de sync manual/cron
│
├── tests/
│   ├── providers/
│   ├── integration/
│   └── mocks/
│
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

---

## Interfaces y Tipos

### ICalendarProvider (Interface)

Todos los proveedores deben implementar esta interfaz:

```javascript
/**
 * @interface ICalendarProvider
 */
class ICalendarProvider {
  /** @type {string} Identificador único del proveedor */
  providerId;
  
  /** @type {string} Nombre legible */
  providerName;

  /**
   * Inicializa el proveedor con tokens OAuth
   * @param {OAuthTokens} tokens
   * @returns {Promise<void>}
   */
  async initialize(tokens) {}

  /**
   * Genera URL de autorización OAuth
   * @param {string} state - State parameter para CSRF
   * @returns {string}
   */
  getAuthUrl(state) {}

  /**
   * Intercambia código de autorización por tokens
   * @param {string} code
   * @returns {Promise<OAuthTokens>}
   */
  async exchangeCodeForTokens(code) {}

  /**
   * Refresca tokens expirados
   * @param {string} refreshToken
   * @returns {Promise<OAuthTokens>}
   */
  async refreshTokens(refreshToken) {}

  /**
   * Lista calendarios del usuario
   * @returns {Promise<UnifiedCalendar[]>}
   */
  async listCalendars() {}

  /**
   * Obtiene eventos de un calendario
   * @param {string} calendarId
   * @param {EventQueryOptions} options
   * @returns {Promise<EventsResult>}
   */
  async getEvents(calendarId, options) {}

  /**
   * Sincronización incremental
   * @param {string} calendarId
   * @param {string|null} syncToken
   * @returns {Promise<SyncResult>}
   */
  async syncEvents(calendarId, syncToken) {}

  /**
   * Registra webhook para notificaciones
   * @param {string} calendarId
   * @param {string} webhookUrl
   * @param {string} channelId
   * @returns {Promise<WebhookRegistration>}
   */
  async registerWebhook(calendarId, webhookUrl, channelId) {}

  /**
   * Cancela webhook
   * @param {string} channelId
   * @param {string} resourceId
   * @returns {Promise<void>}
   */
  async unregisterWebhook(channelId, resourceId) {}
}
```

### Tipos de Datos Unificados

```javascript
/**
 * @typedef {Object} UnifiedCalendar
 * @property {string} id - ID único (provider:originalId)
 * @property {string} providerId - 'google' | 'microsoft'
 * @property {string} originalId - ID en el proveedor original
 * @property {string} name - Nombre del calendario
 * @property {string} [description]
 * @property {string} timeZone
 * @property {string} color - Código hex
 * @property {boolean} isPrimary
 * @property {string} accessRole - 'owner' | 'writer' | 'reader'
 */

/**
 * @typedef {Object} UnifiedEvent
 * @property {string} id - ID único (provider:calendarId:eventId)
 * @property {string} providerId
 * @property {string} calendarId
 * @property {string} originalId
 * @property {string} title
 * @property {string} [description]
 * @property {string} [location]
 * @property {EventDateTime} start
 * @property {EventDateTime} end
 * @property {boolean} isAllDay
 * @property {string} status - 'confirmed' | 'tentative' | 'cancelled'
 * @property {string} [htmlLink]
 * @property {Attendee[]} [attendees]
 * @property {Organizer} [organizer]
 * @property {string[]} [recurrence] - RRULE strings
 * @property {string} [recurringEventId]
 * @property {string} created - ISO datetime
 * @property {string} updated - ISO datetime
 * @property {Object} [raw] - Evento original del proveedor (debug)
 */

/**
 * @typedef {Object} EventDateTime
 * @property {string} dateTime - ISO datetime (eventos con hora)
 * @property {string} [date] - YYYY-MM-DD (eventos all-day)
 * @property {string} timeZone
 */

/**
 * @typedef {Object} EventQueryOptions
 * @property {string} [timeMin] - ISO datetime
 * @property {string} [timeMax] - ISO datetime
 * @property {number} [maxResults]
 * @property {string} [query] - Búsqueda de texto
 * @property {boolean} [singleEvents] - Expandir recurrentes
 * @property {string} [orderBy] - 'startTime' | 'updated'
 */

/**
 * @typedef {Object} SyncResult
 * @property {UnifiedEvent[]} events - Eventos creados/modificados/eliminados
 * @property {string} syncToken - Token para próxima sync
 * @property {boolean} fullSync - true si fue sync completa
 */

/**
 * @typedef {Object} OAuthTokens
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt - Unix timestamp
 * @property {string} [scope]
 * @property {string} [tokenType]
 */
```

---

## Configuración

### Variables de Entorno (.env)

```bash
# === General ===
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Session secret para cookies
SESSION_SECRET=cambiar-en-produccion

# === Google OAuth ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_SCOPES=https://www.googleapis.com/auth/calendar.readonly

# === Microsoft OAuth ===
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
# Usar 'common' para multi-tenant, o tenant ID específico para single-tenant
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback
MICROSOFT_SCOPES=Calendars.Read User.Read offline_access

# === Base de datos ===
# SQLite (desarrollo)
DATABASE_URL=sqlite://./data/calendar.db

# PostgreSQL (producción)
# DATABASE_URL=postgresql://user:pass@host:5432/calendar

# === Redis (opcional) ===
# REDIS_URL=redis://localhost:6379

# === Webhooks ===
# URL pública para recibir notificaciones (usar ngrok en desarrollo)
WEBHOOK_BASE_URL=https://tu-dominio.com
```

### Configuración de Google Cloud Console

1. **Crear proyecto** en <https://console.cloud.google.com>

2. **Habilitar API**:
   - APIs & Services → Library → "Google Calendar API" → Enable

3. **Pantalla de consentimiento**:
   - APIs & Services → OAuth consent screen
   - User Type: External (o Internal si es Workspace)
   - App name, logo, support email
   - Scopes: añadir `../auth/calendar.readonly`
   - Test users: añadir emails para pruebas (si External)

4. **Credenciales OAuth**:
   - APIs & Services → Credentials → Create Credentials → OAuth Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Copiar Client ID y Client Secret

### Configuración de Azure AD / Microsoft Entra

1. **Registrar aplicación** en <https://portal.azure.com>:
   - Azure Active Directory → App registrations → New registration
   - Name: "Unified Calendar Service"
   - Supported account types:
     - "Accounts in any organizational directory and personal Microsoft accounts" (multi-tenant + personal)
   - Redirect URI: Web → `http://localhost:3000/auth/microsoft/callback`

2. **Client Secret**:
   - Certificates & secrets → Client secrets → New client secret
   - Copiar el Value inmediatamente (solo se muestra una vez)

3. **Permisos de API**:
   - API permissions → Add a permission → Microsoft Graph
   - Delegated permissions:
     - `Calendars.Read` - Leer calendarios
     - `User.Read` - Leer perfil básico
     - `offline_access` - Obtener refresh token
   - Click "Grant admin consent" si tienes permisos de admin

4. **Copiar IDs**:
   - Overview → Application (client) ID → `MICROSOFT_CLIENT_ID`
   - Overview → Directory (tenant) ID → `MICROSOFT_TENANT_ID` (o usar "common")

---

## Guía de Implementación

### Fase 1: Estructura Base

**Archivos a crear:**

1. `src/config/index.js` - Carga y valida variables de entorno
2. `src/core/errors.js` - Clases de error personalizadas
3. `src/core/interfaces.js` - Documentación JSDoc de interfaces
4. `src/providers/base-provider.js` - Clase abstracta con métodos comunes
5. `src/utils/logger.js` - Logger con niveles y formato
6. `src/utils/date-utils.js` - Helpers para fechas/zonas horarias

### Fase 2: Proveedor Google

**Archivos:**

1. `src/providers/google/google-auth.js`:
   - Crear OAuth2Client con credenciales
   - `getAuthUrl(state)` - Generar URL de autorización
   - `exchangeCode(code)` - Intercambiar código por tokens
   - `refreshTokens(refreshToken)` - Renovar tokens
   - Configurar listener para renovación automática

2. `src/providers/google/google-mapper.js`:
   - `mapCalendar(googleCalendar)` → `UnifiedCalendar`
   - `mapEvent(googleEvent, calendarId)` → `UnifiedEvent`
   - Manejar eventos all-day vs con hora
   - Normalizar attendees y recurrence

3. `src/providers/google/google-provider.js`:
   - Implementar `ICalendarProvider`
   - Usar `googleapis` calendar v3
   - Manejar paginación con `pageToken`
   - Implementar sync con `syncToken`
   - Webhooks con `calendar.events.watch()`

**Endpoints Google Calendar API:**

```
GET  /calendars/{calendarId}/events      → getEvents()
GET  /calendars/{calendarId}/events      + syncToken → syncEvents()
POST /calendars/{calendarId}/events/watch → registerWebhook()
POST /channels/stop                       → unregisterWebhook()
```

### Fase 3: Proveedor Microsoft

**Archivos:**

1. `src/providers/microsoft/microsoft-auth.js`:
   - Crear `ConfidentialClientApplication` de MSAL
   - `getAuthUrl(state)` - URL con scopes
   - `acquireTokenByCode(code)` - Intercambiar código
   - `acquireTokenSilent()` - Usar refresh token
   - Manejar cache de tokens de MSAL

2. `src/providers/microsoft/microsoft-mapper.js`:
   - `mapCalendar(graphCalendar)` → `UnifiedCalendar`
   - `mapEvent(graphEvent, calendarId)` → `UnifiedEvent`
   - Convertir formato de fechas de Graph
   - Mapear `responseStatus` de attendees

3. `src/providers/microsoft/microsoft-provider.js`:
   - Implementar `ICalendarProvider`
   - Usar `@microsoft/microsoft-graph-client`
   - Paginación con `@odata.nextLink`
   - Delta queries para sync incremental
   - Subscriptions para webhooks

**Endpoints Microsoft Graph:**

```
GET  /me/calendars                        → listCalendars()
GET  /me/calendars/{id}/events            → getEvents()
GET  /me/calendars/{id}/calendarView      → getEvents() con rango
GET  /me/calendars/{id}/events/delta      → syncEvents()
POST /subscriptions                        → registerWebhook()
DELETE /subscriptions/{id}                 → unregisterWebhook()
```

**Diferencias clave con Google:**

| Aspecto | Google | Microsoft |
|---------|--------|-----------|
| Auth library | googleapis OAuth2Client | @azure/msal-node |
| API client | googleapis | @microsoft/microsoft-graph-client |
| Sync token | `syncToken` en response | `@odata.deltaLink` URL completa |
| Webhook duration | Máx 7 días | Máx 3 días (calendarios) |
| Webhook renewal | Re-registrar | PATCH /subscriptions/{id} |
| All-day events | `date` field | `isAllDay: true` + dateTime |
| Timezone | Explicit en cada evento | En body o header |

### Fase 4: Calendar Manager

`src/core/calendar-manager.js`:

```javascript
class CalendarManager {
  constructor(tokenStore, eventStore, syncStore) {
    this.providers = new Map(); // providerId → provider instance
    this.tokenStore = tokenStore;
    this.eventStore = eventStore;
    this.syncStore = syncStore;
  }

  // Registrar proveedores disponibles
  registerProvider(providerId, providerClass) {}

  // Inicializar proveedor para un usuario
  async initializeProvider(userId, providerId) {}

  // === OAuth Flows ===
  getAuthUrl(providerId, userId) {}
  async handleOAuthCallback(providerId, userId, code) {}

  // === Unified API ===
  async listAllCalendars(userId) {}
  async getEvents(userId, calendarId, options) {}
  async syncCalendar(userId, calendarId) {}
  async syncAllCalendars(userId) {}

  // === Webhooks ===
  async registerWebhooks(userId, calendarId) {}
  async handleWebhookNotification(providerId, headers, body) {}
}
```

### Fase 5: API REST

**Rutas de autenticación** (`src/routes/auth.routes.js`):

```
GET  /auth/:provider              → Inicia OAuth flow
GET  /auth/:provider/callback     → Callback OAuth
POST /auth/:provider/disconnect   → Revoca tokens
GET  /auth/status                 → Estado de conexiones
```

**Rutas de calendarios** (`src/routes/calendar.routes.js`):

```
GET  /api/calendars               → Lista todos los calendarios (todos los proveedores)
GET  /api/calendars/:id           → Detalle de un calendario
```

**Rutas de eventos** (`src/routes/events.routes.js`):

```
GET  /api/events                  → Eventos de todos los calendarios
GET  /api/events?calendar=:id     → Eventos de un calendario específico
GET  /api/events?provider=:name   → Eventos de un proveedor
GET  /api/events/:id              → Evento específico
GET  /api/sync                    → Ejecuta sync incremental
GET  /api/sync?calendar=:id       → Sync de calendario específico
```

**Rutas de webhooks** (`src/routes/webhook.routes.js`):

```
POST /webhooks/google             → Notificaciones de Google
POST /webhooks/microsoft          → Notificaciones de Microsoft
POST /api/webhooks/register       → Registrar webhook manualmente
DELETE /api/webhooks/:channelId   → Cancelar webhook
```

### Fase 6: Persistencia

**Token Store** (`src/stores/token-store.js`):

- Guardar/recuperar tokens OAuth por usuario y proveedor
- Encriptar tokens en reposo
- Interfaz: `get(userId, providerId)`, `set(userId, providerId, tokens)`, `delete(userId, providerId)`

**Event Store** (`src/stores/event-store.js`):

- Cache de eventos para respuestas rápidas
- Interfaz: `upsertEvents(events)`, `deleteEvent(id)`, `getEvents(query)`, `getEvent(id)`

**Sync Store** (`src/stores/sync-store.js`):

- Guardar syncToken/deltaLink por calendario
- Interfaz: `getSyncToken(calendarId)`, `setSyncToken(calendarId, token)`, `getLastSync(calendarId)`

### Fase 7: Webhooks y Background Jobs

**Renovación de webhooks:**

- Microsoft: subscriptions expiran en 3 días máximo
- Crear job que renueve 24h antes de expirar
- Tabla de subscriptions activas con fecha de expiración

**Sync periódico:**

- Fallback si webhooks fallan
- Cron job cada 15-30 minutos
- Solo sync incremental (usa syncToken)

---

## Flujos de Datos

### OAuth Flow (Usuario conecta cuenta)

```
Usuario                   App                    Proveedor
   │                       │                         │
   ├──→ GET /auth/google ──┤                         │
   │                       ├── redirect ───────────→ │
   │                       │                         │
   │  ←───────── consent screen ───────────────────┤
   │                       │                         │
   ├── authorize ──────────────────────────────────→ │
   │                       │                         │
   │  ←─── redirect /auth/google/callback?code=xxx ─┤
   │                       │                         │
   │                       ├── exchange code ──────→ │
   │                       │  ←── tokens ───────────┤
   │                       │                         │
   │                       ├── save tokens           │
   │                       ├── init provider         │
   │                       ├── list calendars ─────→ │
   │                       │  ←── calendars ────────┤
   │  ←── success ─────────┤                         │
```

### Sync Flow (Sincronización incremental)

```
App                                    Proveedor
 │                                         │
 ├── get syncToken from store              │
 │                                         │
 ├── GET /events?syncToken=xxx ──────────→ │
 │  ←── changed events + newSyncToken ────┤
 │                                         │
 ├── process events:                       │
 │   - upsert modified                     │
 │   - delete cancelled                    │
 │                                         │
 ├── save newSyncToken to store            │
 │                                         │
```

### Webhook Flow (Notificación en tiempo real)

```
Proveedor                  App                     
    │                       │                      
    ├── POST /webhooks/xxx ─┤                      
    │   (calendar changed)  │                      
    │  ←── 200 OK ──────────┤ (responder rápido)   
    │                       │                      
    │                       ├── queue sync job     
    │                       │                      
    │                       ├── (async) sync       
    │                       │                      
```

---

## Testing

### Mocks

Crear mocks de las APIs para tests sin conexión:

```javascript
// tests/mocks/google-api.mock.js
export const mockGoogleCalendarApi = {
  calendarList: {
    list: jest.fn().mockResolvedValue({
      data: { items: [/* mock calendars */] }
    })
  },
  events: {
    list: jest.fn().mockResolvedValue({
      data: { items: [/* mock events */], nextSyncToken: 'xxx' }
    })
  }
};
```

### Tests Unitarios

- Mappers: verificar transformación correcta de eventos
- Providers: mockear APIs, verificar lógica
- CalendarManager: verificar orquestación

### Tests de Integración

- OAuth flow completo (con servidor mock)
- Sync incremental end-to-end
- Webhook handling

---

## Deployment

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
```

### Variables de entorno en producción

- Usar secrets management (Vault, Azure Key Vault, AWS Secrets Manager)
- Nunca commitear `.env` con credenciales reales
- Rotar client secrets periódicamente

### Alta disponibilidad

- Stateless: toda la sesión en DB/Redis
- Múltiples instancias detrás de load balancer
- Redis para sync state compartido entre instancias
- Health endpoint para liveness/readiness probes

---

## Seguridad

### Tokens

- Encriptar tokens en reposo (AES-256)
- Usar HTTPS siempre
- Validar state parameter en OAuth callback
- Tokens en memoria solo durante request

### Webhooks

- Verificar origen de webhooks:
  - Google: verificar header `X-Goog-Resource-State`
  - Microsoft: validar `clientState` enviado al crear subscription
- Rate limiting en endpoints de webhook
- No exponer información sensible en respuestas

### API

- Autenticación por sesión o API key
- Rate limiting por usuario
- Validar todos los inputs
- Logging de accesos (sin datos sensibles)

---

## Roadmap / Tareas

### MVP (Semanas 1-3)

- [ ] Setup proyecto base con estructura
- [ ] Configuración y variables de entorno
- [ ] Google Provider completo
  - [ ] OAuth flow
  - [ ] List calendars
  - [ ] Get events
  - [ ] Sync incremental
- [ ] Microsoft Provider completo
  - [ ] OAuth flow  
  - [ ] List calendars
  - [ ] Get events
  - [ ] Delta sync
- [ ] Calendar Manager básico
- [ ] API REST endpoints
- [ ] SQLite store para desarrollo

### Fase 2 (Semanas 4-5)

- [ ] Webhooks Google
- [ ] Subscriptions Microsoft
- [ ] Job de renovación de subscriptions
- [ ] Event store con cache
- [ ] Tests unitarios

### Fase 3 (Semana 6+)

- [ ] PostgreSQL store
- [ ] Redis para sync state
- [ ] Docker + docker-compose
- [ ] Tests de integración
- [ ] Documentación API (OpenAPI/Swagger)
- [ ] Monitoring y métricas

### Futuro

- [ ] Crear eventos (write)
- [ ] Más proveedores (Apple Calendar via CalDAV, Fastmail, etc.)
- [ ] UI de administración
- [ ] Multi-tenant

---

## Referencias

### Google Calendar API

- Documentación: <https://developers.google.com/calendar/api/v3/reference>
- Node.js client: <https://github.com/googleapis/google-api-nodejs-client>
- Sync: <https://developers.google.com/calendar/api/guides/sync>
- Push notifications: <https://developers.google.com/calendar/api/guides/push>

### Microsoft Graph API

- Documentación: <https://learn.microsoft.com/en-us/graph/api/resources/calendar>
- Node.js client: <https://github.com/microsoftgraph/msgraph-sdk-javascript>
- Delta queries: <https://learn.microsoft.com/en-us/graph/delta-query-overview>
- Subscriptions: <https://learn.microsoft.com/en-us/graph/api/resources/subscription>

### MSAL

- Documentación: <https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-node-migration>
- GitHub: <https://github.com/AzureAD/microsoft-authentication-library-for-js>
