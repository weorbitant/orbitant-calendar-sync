import { getGoogleAuthUrl } from '../actions/oauth.js';
import { OAuthToken } from '../../models/OAuthToken.js';
import GoogleCalendarService from '../../services/google-calendar.js';

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
        text: `📅 *Google Calendar Service* • Ultima sync: ${syncText}`
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
 * Registra el comando /ajustes en el bot de Slack
 * @param {import('@slack/bolt').App} app - Instancia del bot de Slack
 */
export function registerAjustesCommand(app) {
  app.command('/ajustes', async ({ command, ack, client }) => {
    await ack();

    const slackUserId = command.user_id;
    const slackTeamId = command.team_id;

    // Verificar si el usuario tiene tokens en la BD
    const tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'google');
    const hasValidTokens = tokenRecord && tokenRecord.refreshToken;

    if (hasValidTokens) {
      // Ya autenticado - mostrar opciones de calendario
      const footerBlocks = buildFooterBlocks(slackUserId, tokenRecord.updated_at);

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: slackUserId,
        text: 'Ajustes de Calendario',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚙️ Ajustes de Calendario',
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Google Calendar conectado*\n\n📧 *Cuenta:* ${tokenRecord.google_email || 'No disponible'}`
            },
            accessory: {
              type: 'image',
              image_url: 'https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png',
              alt_text: 'Google Calendar'
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🔗 _Vinculado desde: ${new Date(tokenRecord.created_at).toLocaleDateString('es-ES')}_`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '💡 *Tip:* Usa `/calendario` para ver tus eventos de hoy y mañana'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🔌 Desconectar cuenta',
                  emoji: true
                },
                style: 'danger',
                action_id: 'disconnect_google',
                confirm: {
                  title: {
                    type: 'plain_text',
                    text: '⚠️ Desconectar Google Calendar'
                  },
                  text: {
                    type: 'mrkdwn',
                    text: 'Esto eliminara la conexion con tu cuenta de Google.\n\n¿Estas seguro que deseas continuar?'
                  },
                  confirm: {
                    type: 'plain_text',
                    text: 'Si, desconectar'
                  },
                  deny: {
                    type: 'plain_text',
                    text: 'Cancelar'
                  }
                }
              }
            ]
          },
          ...footerBlocks
        ]
      });
    } else {
      // No autenticado - mostrar boton de OAuth
      const { url: authUrl } = getGoogleAuthUrl({
        id: slackUserId,
        teamId: slackTeamId,
        name: command.user_name
      });

      const footerBlocks = buildFooterBlocks(slackUserId, null);

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: slackUserId,
        text: 'Conectar Google Calendar',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📅 Conectar Google Calendar',
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🔗 *Vincular cuenta de Google*\n\nPara ver tus eventos del calendario, primero necesitas conectar tu cuenta de Google.'
            },
            accessory: {
              type: 'image',
              image_url: 'https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png',
              alt_text: 'Google Calendar'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🚀 Conectar con Google',
                  emoji: true
                },
                style: 'primary',
                action_id: 'google_oauth_start',
                url: authUrl
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '🔒 _Tu informacion se almacena de forma segura y encriptada_'
              }
            ]
          },
          ...footerBlocks
        ]
      });
    }
  });

  // Handler para desconectar cuenta
  app.action('disconnect_google', async ({ body, ack, client }) => {
    await ack();

    const slackUserId = body.user.id;

    // Eliminar tokens de la BD
    const deleted = OAuthToken.delete(slackUserId, 'google');

    if (deleted) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '✅ Cuenta desconectada',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '✅ *Cuenta de Google desconectada correctamente*\n\nPuedes volver a conectarla ejecutando `/ajustes`'
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

    // Verificar que tiene tokens
    const tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'google');
    if (!tokenRecord || !tokenRecord.refreshToken) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '⚠️ No tienes una cuenta de Google vinculada.'
      });
      return;
    }

    try {
      // Notificar que se esta sincronizando
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: '🔄 Sincronizando calendario...'
      });

      // Ejecutar sync del calendario del usuario
      const service = new GoogleCalendarService();
      await service.initOAuthFromDB(slackUserId);
      const result = await service.syncEvents();

      const eventsCount = result.events?.length || 0;
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: `✅ Sincronizacion completada`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Sincronizacion completada*\n\n📊 ${eventsCount} evento(s) procesado(s)`
            }
          }
        ]
      });
    } catch (error) {
      console.error('[Slack] Error sincronizando calendario:', error.message);
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: slackUserId,
        text: `❌ Error al sincronizar: ${error.message}`
      });
    }
  });
}
