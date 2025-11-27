import { getGoogleAuthUrl } from '../actions/oauth.js';
import { getMicrosoftAuthUrl } from '../actions/microsoft-oauth.js';
import { OAuthToken } from '../../models/OAuthToken.js';
import { FeedToken } from '../../models/FeedToken.js';
import { Source } from '../../models/Source.js';
import { SyncService } from '../../services/SyncService.js';
import { buildSourcesBlocks } from '../actions/sources.js';

/**
 * Construye la URL del feed iCal para un usuario
 * @param {string} slackUserId
 * @returns {string}
 */
function getFeedUrl(slackUserId) {
  const feedToken = FeedToken.getOrCreateForUser(slackUserId);
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${baseUrl}/feed/${feedToken.token}/orbitando.ics`;
}

/**
 * Construye los bloques de la seccion "Mi Feed iCal"
 * @param {string} slackUserId
 * @returns {Array}
 */
function buildFeedBlocks(slackUserId) {
  const feedUrl = getFeedUrl(slackUserId);

  return [
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Mi Feed iCal*\n\nSuscribete desde cualquier app de calendario:'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `\`${feedUrl}\``
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Regenerar URL', emoji: true },
        action_id: 'regenerate_feed_token',
        style: 'danger',
        confirm: {
          title: { type: 'plain_text', text: 'Regenerar URL del feed' },
          text: {
            type: 'mrkdwn',
            text: 'Esto invalidara la URL actual. Los calendarios que la esten usando dejaran de actualizarse.\n\nDeseas continuar?'
          },
          confirm: { type: 'plain_text', text: 'Si, regenerar' },
          deny: { type: 'plain_text', text: 'Cancelar' }
        }
      }
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: '_Copia esta URL en Google Calendar, Apple Calendar u Outlook_'
      }]
    }
  ];
}

/**
 * Verifica si un usuario es administrador
 * @param {string} userId - Slack User ID
 * @returns {boolean}
 */
function isAdmin(userId) {
  const admins = (process.env.SLACK_ADMINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return admins.includes(userId);
}

/**
 * Construye los bloques del footer con info de sync y boton para admins
 * @param {string} userId - Slack User ID
 * @param {string|null} lastSyncDate - Fecha de ultima sincronizacion
 * @returns {Array} - Bloques de Slack
 */
function buildFooterBlocks(userId, lastSyncDate) {
  const syncText = lastSyncDate
    ? new Date(lastSyncDate).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    : 'nunca';

  const blocks = [
    { type: 'divider' },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `📅 *Calendar Service* • Ultima sync: ${syncText}`
      }]
    }
  ];

  if (isAdmin(userId)) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🔄 Sincronizar', emoji: true },
        action_id: 'sync_calendar_admin',
        style: 'primary'
      }]
    });
  }

  return blocks;
}

/**
 * Construye los bloques de conexion de Google Calendar
 * @param {string} slackUserId - ID del usuario de Slack
 * @param {string} slackTeamId - ID del workspace de Slack
 * @param {string} userName - Nombre del usuario
 * @param {string} responseUrl - URL para actualizar mensaje de Slack
 * @param {string} channelId - ID del canal de Slack
 */
function buildGoogleConnectionBlocks(slackUserId, slackTeamId, userName, responseUrl, channelId) {
  const tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'google');
  const hasValidTokens = tokenRecord && tokenRecord.refreshToken;

  if (hasValidTokens) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:google-calendar: *Cuenta:* ${tokenRecord.account_email || 'No disponible'}`
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Desconectar', emoji: true },
          style: 'danger',
          action_id: 'disconnect_google',
          confirm: {
            title: { type: 'plain_text', text: 'Desconectar Google Calendar' },
            text: { type: 'mrkdwn', text: 'Esto eliminara la conexion con tu cuenta de Google.\n\nEstas seguro?' },
            confirm: { type: 'plain_text', text: 'Si, desconectar' },
            deny: { type: 'plain_text', text: 'Cancelar' }
          }
        }
      }
    ];
  } else {
    const { url: authUrl } = getGoogleAuthUrl({
      id: slackUserId,
      teamId: slackTeamId,
      name: userName,
      responseUrl,
      channelId
    });

    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':google-calendar: \nConecta tu cuenta de Google para sincronizar tus eventos.'
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Conectar', emoji: true },
          style: 'primary',
          action_id: 'google_oauth_start',
          url: authUrl
        }
      }
    ];
  }
}

/**
 * Construye los bloques de conexion de Microsoft Outlook
 * @param {string} slackUserId - ID del usuario de Slack
 * @param {string} slackTeamId - ID del workspace de Slack
 * @param {string} userName - Nombre del usuario
 * @param {string} responseUrl - URL para actualizar mensaje de Slack
 * @param {string} channelId - ID del canal de Slack
 */
async function buildMicrosoftConnectionBlocks(slackUserId, slackTeamId, userName, responseUrl, channelId) {
  const tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'microsoft');
  const hasValidTokens = tokenRecord && tokenRecord.refreshToken;

  if (hasValidTokens) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:ms_outlook: *Cuenta:* ${tokenRecord.account_email || 'No disponible'}`
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Desconectar', emoji: true },
          style: 'danger',
          action_id: 'disconnect_microsoft',
          confirm: {
            title: { type: 'plain_text', text: 'Desconectar Microsoft Outlook' },
            text: { type: 'mrkdwn', text: 'Esto eliminara la conexion con tu cuenta de Microsoft.\n\nEstas seguro?' },
            confirm: { type: 'plain_text', text: 'Si, desconectar' },
            deny: { type: 'plain_text', text: 'Cancelar' }
          }
        }
      }
    ];
  } else {
    const { url: authUrl } = await getMicrosoftAuthUrl({
      id: slackUserId,
      teamId: slackTeamId,
      name: userName,
      responseUrl,
      channelId
    });

    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':ms_outlook: \nConecta tu cuenta de Microsoft para sincronizar tus eventos.'
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Conectar', emoji: true },
          style: 'primary',
          action_id: 'microsoft_oauth_start',
          url: authUrl
        }
      }
    ];
  }
}

/**
 * Registra el comando /ajustes en el bot de Slack
 * @param {import('@slack/bolt').App} app - Instancia del bot de Slack
 */
export function registerAjustesCommand(app) {
  app.command('/ajustes', async ({ command, ack, client }) => {
    await ack();

    const slackUserId = command.user_id;
    const slackTeamId = command.team_id;
    const userName = command.user_name;
    const responseUrl = command.response_url;
    const channelId = command.channel_id;

    console.log(`[Slack] /ajustes invoked by user ${slackUserId} @${userName}`);

    // Construir bloques de conexion de proveedores
    const googleBlocks = buildGoogleConnectionBlocks(slackUserId, slackTeamId, userName, responseUrl, channelId);
    const microsoftBlocks = await buildMicrosoftConnectionBlocks(slackUserId, slackTeamId, userName, responseUrl, channelId);

    // Verificar si hay al menos un proveedor conectado para el footer
    const googleToken = OAuthToken.findBySlackUserId(slackUserId, 'google');
    const microsoftToken = OAuthToken.findBySlackUserId(slackUserId, 'microsoft');
    const lastSyncDate = googleToken?.updated_at || microsoftToken?.updated_at || null;

    const footerBlocks = buildFooterBlocks(slackUserId, lastSyncDate);
    const sourcesBlocks = buildSourcesBlocks(slackUserId);
    const feedBlocks = (googleToken || microsoftToken) ? buildFeedBlocks(slackUserId) : [];

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: slackUserId,
      text: 'Ajustes de Calendario',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Ajustes de Calendario',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':world_map: *Conectar proveedores de calendario*'
          }
        },
        ...googleBlocks,
        ...microsoftBlocks,
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: '_Tu informacion se almacena de forma segura y encriptada_'
          }]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Tip:* Usa `/calendario` para ver tus eventos de hoy y manana'
          }
        },
        ...sourcesBlocks,
        ...feedBlocks,
        ...footerBlocks
      ]
    });
  });

  // Handler para desconectar cuenta de Google
  app.action('disconnect_google', async ({ body, ack, client }) => {
    await ack();

    const slackUserId = body.user.id;

    // 1. Eliminar sources de tipo 'google' (CASCADE borra eventos y sync_state)
    const sourcesDeleted = Source.deleteByProviderForUser(slackUserId, 'google');

    // 2. Eliminar tokens OAuth
    const tokenDeleted = OAuthToken.delete(slackUserId, 'google');

    if (tokenDeleted) {
      const sourcesText = sourcesDeleted > 0
        ? `\n\nSe ${sourcesDeleted === 1 ? 'elimino 1 calendario' : `eliminaron ${sourcesDeleted} calendarios`} y sus eventos.`
        : '';

      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '✅ Cuenta desconectada',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Cuenta de Google desconectada correctamente*${sourcesText}\n\nPuedes volver a conectarla ejecutando \`/ajustes\``
            }
          }
        ]
      });
    } else {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '⚠️ No se encontro ninguna cuenta de Google conectada.'
      });
    }
  });

  // Handler para el boton de OAuth (no se ejecuta porque tiene URL)
  app.action('google_oauth_start', async ({ ack }) => {
    await ack();
  });

  // Handler para desconectar cuenta de Microsoft
  app.action('disconnect_microsoft', async ({ body, ack, client }) => {
    await ack();

    const slackUserId = body.user.id;

    // 1. Eliminar sources de tipo 'microsoft' (CASCADE borra eventos y sync_state)
    const sourcesDeleted = Source.deleteByProviderForUser(slackUserId, 'microsoft');

    // 2. Eliminar tokens OAuth
    const tokenDeleted = OAuthToken.delete(slackUserId, 'microsoft');

    if (tokenDeleted) {
      const sourcesText = sourcesDeleted > 0
        ? `\n\nSe ${sourcesDeleted === 1 ? 'elimino 1 calendario' : `eliminaron ${sourcesDeleted} calendarios`} y sus eventos.`
        : '';

      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '✅ Cuenta de Microsoft desconectada',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Cuenta de Microsoft desconectada correctamente*${sourcesText}\n\nPuedes volver a conectarla ejecutando \`/ajustes\``
            }
          }
        ]
      });
    } else {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '⚠️ No se encontro ninguna cuenta de Microsoft conectada.'
      });
    }
  });

  // Handler para el boton de OAuth Microsoft (no se ejecuta porque tiene URL)
  app.action('microsoft_oauth_start', async ({ ack }) => {
    await ack();
  });

  // Handler para regenerar token del feed iCal
  app.action('regenerate_feed_token', async ({ body, ack, client }) => {
    await ack();

    const slackUserId = body.user.id;

    try {
      // Regenerar token
      const newToken = FeedToken.regenerateToken(slackUserId);
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const newFeedUrl = `${baseUrl}/feed/${newToken.token}/orbitando.ics`;

      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: 'URL regenerada',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Nueva URL del feed generada:*'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`${newFeedUrl}\``
            }
          },
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: '_La URL anterior ha sido invalidada. Actualiza la suscripcion en tus apps de calendario._'
            }]
          }
        ]
      });
    } catch (error) {
      console.error('[Slack] Error regenerando feed token:', error.message);
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: `Error al regenerar URL: ${error.message}`
      });
    }
  });

  // Handler para sincronizar calendario (solo admins)
  app.action('sync_calendar_admin', async ({ body, ack, client }) => {
    await ack();

    const slackUserId = body.user.id;

    // Verificar que es admin
    if (!isAdmin(slackUserId)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '🚫 No tienes permisos para realizar esta accion.'
      });
      return;
    }

    // Obtener todos los sources del usuario
    const sources = Source.findBySlackUserId(slackUserId);

    if (sources.length === 0) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '⚠️ No tienes ningun calendario configurado.'
      });
      return;
    }

    try {
      // Notificar que se esta sincronizando
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '🔄 Sincronizando calendarios...'
      });

      const syncService = new SyncService();
      const results = [];

      // Sincronizar cada source
      for (const source of sources) {
        try {
          const result = await syncService.syncSource(source.id);
          results.push({
            name: source.name,
            type: source.type,
            success: true,
            count: result.eventsCount || 0,
            unchanged: result.unchanged || false
          });
        } catch (error) {
          console.error(`[Slack] Error sincronizando ${source.name}:`, error.message);
          results.push({
            name: source.name,
            type: source.type,
            success: false,
            error: error.message
          });
        }
      }

      // Construir mensaje de resultados
      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);

      let resultText = '✅ *Sincronizacion completada*\n\n';

      if (successResults.length > 0) {
        const totalEvents = successResults.reduce((sum, r) => sum + r.count, 0);
        resultText += `📊 ${totalEvents} evento(s) en total\n`;
        successResults.forEach(r => {
          const status = r.unchanged ? '(sin cambios)' : '';
          resultText += `• ${r.name}: ${r.count} evento(s) ${status}\n`;
        });
      }

      if (failedResults.length > 0) {
        resultText += '\n⚠️ *Errores:*\n';
        failedResults.forEach(r => {
          resultText += `• ${r.name}: ${r.error}\n`;
        });
      }

      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '✅ Sincronizacion completada',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: resultText
            }
          }
        ]
      });
    } catch (error) {
      console.error('[Slack] Error sincronizando calendarios:', error.message);
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: `❌ Error al sincronizar: ${error.message}`
      });
    }
  });
}
