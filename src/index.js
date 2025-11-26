import express from 'express';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './config/database.js';
import { getSyncScheduler } from './jobs/SyncScheduler.js';
import sourcesRouter from './routes/sources.js';
import syncRouter from './routes/sync.js';
import calendarRouter from './routes/calendar.js';
import GoogleCalendarService from './services/google-calendar.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Legacy: Almacén en memoria para syncToken de webhooks Google
let legacySyncState = {
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
// NEW API ROUTES
// ============================================

app.use('/api/sources', sourcesRouter);
app.use('/api/sync', syncRouter);
app.use('/api', calendarRouter);

// ============================================
// LEGACY WEBHOOK ENDPOINTS (Google Push Notifications)
// ============================================

/**
 * POST /api/webhook
 * Endpoint para recibir notificaciones push de Google
 */
app.post('/api/webhook', async (req, res) => {
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
app.post('/api/webhook/register', async (req, res) => {
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
app.delete('/api/webhook/:channelId', async (req, res) => {
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
// OAUTH CALLBACK
// ============================================

app.get('/oauth/callback', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>Servidor incorrecto</h1>
        <p>Para generar tokens, ejecuta: <code>npm run auth</code></p>
      </body>
    </html>
  `);
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
    console.log('Initializing database...');
    initializeDatabase();

    // Initialize legacy Google Calendar service (optional)
    await initCalendarService();

    // Start sync scheduler
    const scheduler = getSyncScheduler();
    scheduler.start();

    app.listen(PORT, () => {
      console.log(`\nServidor corriendo en http://localhost:${PORT}`);
      console.log('\nEndpoints disponibles:');
      console.log('  --- Sources ---');
      console.log('  GET    /api/sources           - Listar fuentes');
      console.log('  POST   /api/sources           - Crear fuente');
      console.log('  GET    /api/sources/:id       - Obtener fuente');
      console.log('  PUT    /api/sources/:id       - Actualizar fuente');
      console.log('  DELETE /api/sources/:id       - Eliminar fuente');
      console.log('  --- Sync ---');
      console.log('  POST   /api/sync              - Sincronizar todas las fuentes');
      console.log('  POST   /api/sync/:sourceId    - Sincronizar fuente específica');
      console.log('  GET    /api/sync/status       - Estado de sincronización');
      console.log('  --- Calendar Output ---');
      console.log('  GET    /api/calendar.ics      - Calendario combinado (ICAL)');
      console.log('  GET    /api/events            - Eventos en JSON');
      console.log('  --- Legacy ---');
      console.log('  POST   /api/webhook           - Receptor de notificaciones Google');
      console.log('  POST   /api/webhook/register  - Registrar webhook Google');
      console.log('  GET    /health                - Estado del servicio\n');
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
