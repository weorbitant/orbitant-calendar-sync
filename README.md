# 📅 Orbitant Calendar Sync

Servicio de sincronización de calendarios (Google Calendar + Microsoft Outlook) con integración Slack.

- [📅 Orbitant Calendar Sync](#-orbitant-calendar-sync)
  - [✨ Características](#-características)
  - [📋 Requisitos](#-requisitos)
  - [🚀 Instalación](#-instalación)
  - [⚙️ Configuración](#️-configuración)
    - [🔴 Google OAuth](#-google-oauth)
    - [🔵 Microsoft/Azure OAuth](#-microsoftazure-oauth)
    - [💜 Slack](#-slack)
    - [🗄️ Servidor y Base de datos](#️-servidor-y-base-de-datos)
  - [📖 Uso](#-uso)
    - [Comandos de Slack](#comandos-de-slack)
    - [Endpoints HTTP](#endpoints-http)
    - [Feed iCal](#feed-ical)
  - [🐳 Docker](#-docker)
  - [📄 Licencia](#-licencia)

## ✨ Características

- 🔄 **Sincronización multi-proveedor** - ICS Via Url, Google Calendar y Microsoft Outlook
- 💬 **Integración Slack** - Comandos `/ajustes` y `/calendario`
- 📡 **Feed iCal unificado** - Suscríbete desde cualquier app de calendario
- ⏰ **Sincronización automática** - Actualización periódica configurable
- 🔐 **OAuth 2.0** - Autenticación segura por usuario

## 📋 Requisitos

- Node.js 20+
- Credenciales OAuth de Google Cloud Console
- App registration en Azure (Microsoft)
- Slack App con Socket Mode habilitado

## 🚀 Instalación

```bash
# Clonar repositorio
git clone <repo-url>
cd google-calendar-service

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar servidor
npm start
```

## ⚙️ Configuración

Edita el archivo `.env` con las siguientes variables:

### 🔴 Google OAuth

```env
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_SCOPES=https://www.googleapis.com/auth/calendar.readonly,https://www.googleapis.com/auth/userinfo.email
```

Obtén las credenciales en [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### 🔵 Microsoft/Azure OAuth

```env
AZURE_CLIENT_ID=tu-client-id
AZURE_CLIENT_SECRET=tu-client-secret
AZURE_TENANT_ID=common
AZURE_REDIRECT_URI=http://localhost:3000/auth/azure/callback
AZURE_SCOPES=https://graph.microsoft.com/Calendars.Read,https://graph.microsoft.com/User.Read,offline_access
```

Obtén las credenciales en [Azure Portal](https://portal.azure.com) > App registrations.

### 💜 Slack

```env
SLACK_APP_TOKEN=xapp-1-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_ADMINS=U12345678,U87654321
```

Crea una Slack App en [api.slack.com](https://api.slack.com/apps) con Socket Mode habilitado.

### 🗄️ Servidor y Base de datos

```env
PORT=3000
BASE_URL=http://localhost:3000
DATABASE_PATH=./data/calendar.db
TOKEN_ENCRYPTION_KEY=<clave-hex-64-caracteres>
SYNC_CRON=0 */15 * * * *
SYNC_ON_STARTUP=true
```

Genera la clave de encriptación con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📖 Uso

### Comandos de Slack

| Comando | Descripción |
|---------|-------------|
| `/ajustes` | Configurar cuentas y calendarios conectados |
| `/calendario` | Ver eventos de hoy y mañana |

### Endpoints HTTP

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Estado del servicio |
| `GET /feed/:token/orbitando.ics` | Feed iCal unificado |
| `GET /auth/google/callback` | Callback OAuth Google |
| `GET /auth/azure/callback` | Callback OAuth Microsoft |

### Feed iCal

Después de conectar tus cuentas via `/ajustes`, obtén tu URL de feed iCal personalizada para suscribirte desde:

- Google Calendar
- Apple Calendar
- Microsoft Outlook
- Cualquier cliente compatible con iCal

## 🐳 Docker

```bash
# Construir y ejecutar
docker-compose up -d

# Ver logs
docker-compose logs -f
```

El servicio estará disponible en `http://localhost:3030`.

## 📄 Licencia

MIT

> Made with ❤️ by @GentooXativa
