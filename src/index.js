import express from 'express';
import { initializeDatabase, closeDatabase } from './config/database.js';
import { getSyncScheduler } from './jobs/SyncScheduler.js';
import GoogleCalendarService from './services/google-calendar.js';
import slackApp from './slack/app.js';
import { registerAjustesCommand } from './slack/commands/ajustes.js';
import { registerCalendarioCommand } from './slack/commands/calendario.js';
import { registerSourceActions } from './slack/actions/sources.js';
import { exchangeCodeForTokens, validateOAuthState, getGoogleUserInfo } from './slack/actions/oauth.js';
import { OAuthToken } from './models/OAuthToken.js';
import { FeedToken } from './models/FeedToken.js';
import { ICalGenerator } from './services/ICalGenerator.js';
import { Source } from './models/Source.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Legacy: Almacén en memoria para syncToken de webhooks Google
const legacySyncState = {
  syncToken: null,
  lastSync: null
};

// Legacy: Servicio de calendario para webhooks Google directos
let calendarService = null;

async function initCalendarService() {
  try {
    calendarService = new GoogleCalendarService();
    await calendarService.initOAuth();
    console.log('Google Calendar Service inicializado');
  } catch (error) {
    console.warn('Google Calendar Service no inicializado:', error.message);
    console.log('Los calendarios Google se configurarán via API de sources');
  }
}

// ============================================
// WEBHOOK ENDPOINTS (Google Push Notifications)
// ============================================

/**
 * POST /api/webhook
 * Endpoint para recibir notificaciones push de Google
 */
app.post('/api/google/webhook', async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];

  console.log(`[Webhook] Canal: ${channelId}, Estado: ${resourceState}`);

  if (resourceState === 'sync') {
    console.log('[Webhook] Canal sincronizado correctamente');
  } else if (resourceState === 'exists' && calendarService) {
    console.log('[Webhook] Cambios detectados, ejecutando sync...');
    try {
      const result = await calendarService.syncEvents(legacySyncState.syncToken);
      legacySyncState.syncToken = result.syncToken;
      console.log(`[Webhook] Sync completado: ${result.events.length} eventos actualizados`);
    } catch (error) {
      console.error('[Webhook] Error en sync:', error.message);
    }
  }

  res.status(200).send('OK');
});

/**
 * POST /api/webhook/register
 * Registra un webhook para recibir notificaciones push
 */
app.post('/api/google/webhook/register', async (req, res) => {
  if (!calendarService) {
    return res.status(503).json({
      success: false,
      error: 'Google Calendar Service no inicializado'
    });
  }

  try {
    const { webhookUrl, channelId } = req.body;

    if (!webhookUrl || !channelId) {
      return res.status(400).json({
        success: false,
        error: 'webhookUrl y channelId son requeridos'
      });
    }

    const result = await calendarService.watchEvents(webhookUrl, channelId);

    res.json({
      success: true,
      channel: {
        id: result.id,
        resourceId: result.resourceId,
        expiration: new Date(parseInt(result.expiration)).toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/webhook/:channelId
 * Detiene un webhook registrado
 */
app.delete('/api/google/webhook/:channelId', async (req, res) => {
  if (!calendarService) {
    return res.status(503).json({
      success: false,
      error: 'Google Calendar Service no inicializado'
    });
  }

  try {
    const { resourceId } = req.body;

    if (!resourceId) {
      return res.status(400).json({
        success: false,
        error: 'resourceId es requerido en el body'
      });
    }

    await calendarService.stopWatch(req.params.channelId, resourceId);
    res.json({ success: true, message: 'Webhook detenido' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GOOGLE OAUTH CALLBACK
// ============================================

/**
 * GET /auth/google/callback
 * Callback para el flujo OAuth de Google Calendar
 */
app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  const errorPageStyle = `
    body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #dc3545; }
  `;

  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Error de autenticacion</title>
        <style>${errorPageStyle}</style>
      </head>
      <body>
        <div class="container">
          <h1>Error de autenticacion</h1>
          <p>${error}</p>
          <p>Puedes cerrar esta ventana.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Error</title>
        <style>${errorPageStyle}</style>
      </head>
      <body>
        <div class="container">
          <h1>Error</h1>
          <p>No se recibio el codigo de autorizacion.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Validar state
  const stateData = validateOAuthState(state);
  if (!stateData || !stateData.slackUserId) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Sesion expirada</title>
        <style>${errorPageStyle}</style>
      </head>
      <body>
        <div class="container">
          <h1>Sesion expirada</h1>
          <p>El enlace de autorizacion ha expirado o es invalido.</p>
          <p>Por favor, vuelve a Slack y ejecuta /calendario nuevamente.</p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    // Intercambiar codigo por tokens
    const tokens = await exchangeCodeForTokens(code);

    // Obtener email de Google
    let googleEmail = null;
    try {
      const userInfo = await getGoogleUserInfo(tokens.access_token);
      googleEmail = userInfo.email;
    } catch (e) {
      console.warn('[OAuth] No se pudo obtener email de Google:', e.message);
    }

    // Guardar tokens en la base de datos
    OAuthToken.upsert({
      slack_user_id: stateData.slackUserId,
      slack_team_id: stateData.slackTeamId,
      slack_user_name: stateData.slackUserName,
      provider: 'google',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope,
      expires_at: tokens.expiry_date,
      google_email: googleEmail
    });

    console.log(`[OAuth] Tokens guardados para usuario Slack: ${stateData.slackUserId} (${googleEmail || 'email desconocido'})`);

    // Create Google Calendar source for this user (if not exists)
    const existingGoogleSources = Source.findBySlackUserId(stateData.slackUserId)
      .filter(s => s.type === 'google');

    if (existingGoogleSources.length === 0) {
      Source.createForUser({
        name: `Google Calendar (${googleEmail || 'primary'})`,
        type: 'google',
        config: { calendarId: 'primary' },
        enabled: 1,
        color: '#4285F4'
      }, stateData.slackUserId);
      console.log(`[OAuth] Created Google Calendar source for user: ${stateData.slackUserId}`);
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Conexion exitosa</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #28a745; }
          .icon { font-size: 48px; margin-bottom: 20px; }
          .email { background: #e9ecef; padding: 8px 16px; border-radius: 4px; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">OK</div>
          <h1>Conexion exitosa!</h1>
          ${googleEmail ? `<p class="email">${googleEmail}</p>` : ''}
          <p>Tu cuenta de Google Calendar ha sido vinculada correctamente.</p>
          <p><strong>Puedes cerrar esta ventana y volver a Slack.</strong></p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[OAuth] Error:', err.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Error</title>
        <style>${errorPageStyle}</style>
      </head>
      <body>
        <div class="container">
          <h1>Error</h1>
          <p>No se pudo completar la autenticacion: ${err.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

// ============================================
// ICAL FEED ENDPOINT
// ============================================

/**
 * GET /feed/:token/orbitando.ics
 * Returns iCal feed for a user (all their calendars, current year)
 */
app.get('/feed/:token/orbitando.ics', (req, res) => {
  const { token } = req.params;

  // Find user by token
  const feedToken = FeedToken.findByToken(token);
  if (!feedToken) {
    return res.status(404).send('Feed not found');
  }

  // Update last used timestamp
  FeedToken.updateLastUsed(token);

  // Generate iCal feed for this user
  const generator = new ICalGenerator({
    calendarName: 'Mi Calendario Unificado'
  });
  const icalContent = generator.generateForUser(feedToken.slack_user_id);

  // Return as iCal
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="calendar.ics"'
  });
  res.send(icalContent);
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  const scheduler = getSyncScheduler();

  res.json({
    status: 'ok',
    service: 'calendar-sync-service',
    legacyGoogleConnected: calendarService !== null,
    scheduler: scheduler.getStatus()
  });
});

// ============================================
// SERVER START
// ============================================

async function start() {
  try {
    // Initialize database
    console.log('Inicializando base de datos...');
    initializeDatabase();

    // Initialize legacy Google Calendar service (optional)
    await initCalendarService();

    // Start sync scheduler
    const scheduler = getSyncScheduler();
    scheduler.start();

    // Registrar comandos y acciones de Slack
    registerAjustesCommand(slackApp);
    registerCalendarioCommand(slackApp);
    registerSourceActions(slackApp);

    // Iniciar bot de Slack (Socket Mode)
    await slackApp.start();
    console.log('Bot de Slack iniciado (Socket Mode)');

    app.listen(PORT, () => {
      console.log(`\nServidor corriendo en http://localhost:${PORT}`);
      console.log('\nEndpoints disponibles:');
      console.log('  GET    /auth/google/callback  - Callback OAuth Google');
      console.log('  POST   /api/google/webhook           - Receptor de notificaciones Google');
      console.log('  POST   /api/google/webhook/register  - Registrar webhook Google');
      console.log('  DELETE /api/google/webhook/:id       - Cancelar webhook');
      console.log('  GET    /feed/:token/orbitando.ics - Feed iCal unificado');
      console.log('  GET    /health                - Estado del servicio');
      console.log('\nComandos de Slack:');
      console.log('  /calendarios                  - Gestionar calendarios\n');
    });
  } catch (error) {
    console.error('Error iniciando servidor:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  const scheduler = getSyncScheduler();
  scheduler.stop();
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  const scheduler = getSyncScheduler();
  scheduler.stop();
  closeDatabase();
  process.exit(0);
});

start();
