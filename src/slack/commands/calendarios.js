import { getGoogleAuthUrl } from '../actions/oauth.js';
import { OAuthToken } from '../../models/OAuthToken.js';
import GoogleCalendarService from '../../services/google-calendar.js';

/**
 * Registra el comando /calendario en el bot de Slack
 * @param {import('@slack/bolt').App} app - Instancia del bot de Slack
 */
export function registerCalendariosCommand(app) {
  app.command('/calendario', async ({ command, ack, client }) => {
    await ack();

    const slackUserId = command.user_id;
    const slackTeamId = command.team_id;

    // Verificar si el usuario tiene tokens en la BD
    const tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'google');
    const hasValidTokens = tokenRecord && tokenRecord.refreshToken;

    if (hasValidTokens) {
      // Ya autenticado - mostrar opciones de calendario
      await client.chat.postMessage({
        channel: command.channel_id,
        text: 'Gestion de Calendarios',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'Gestion de Calendarios',
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Google Calendar conectado*\n\nCuenta vinculada: ${tokenRecord.google_email || 'No disponible'}`
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
                  text: 'Ver eventos de hoy',
                  emoji: true
                },
                action_id: 'view_today_events'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Desconectar cuenta',
                  emoji: true
                },
                style: 'danger',
                action_id: 'disconnect_google',
                confirm: {
                  title: {
                    type: 'plain_text',
                    text: 'Desconectar Google Calendar'
                  },
                  text: {
                    type: 'mrkdwn',
                    text: 'Esto eliminara la conexion con tu cuenta de Google. Tendras que volver a autorizar para usar el bot.'
                  },
                  confirm: {
                    type: 'plain_text',
                    text: 'Desconectar'
                  },
                  deny: {
                    type: 'plain_text',
                    text: 'Cancelar'
                  }
                }
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `_Vinculado desde: ${new Date(tokenRecord.created_at).toLocaleDateString('es-ES')}_`
              }
            ]
          }
        ]
      });
    } else {
      // No autenticado - mostrar boton de OAuth
      const { url: authUrl } = getGoogleAuthUrl({
        id: slackUserId,
        teamId: slackTeamId,
        name: command.user_name
      });

      await client.chat.postMessage({
        channel: command.channel_id,
        text: 'Conectar Google Calendar',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'Conectar Google Calendar',
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Vincular cuenta de Google*\n\nPara usar el bot de calendarios, primero necesitas conectar tu cuenta de Google Calendar.'
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
                  text: 'Conectar con Google',
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
                text: '_Al hacer clic seras redirigido a Google para autorizar el acceso a tu calendario. Tu informacion se almacena de forma segura._'
              }
            ]
          }
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
      await client.chat.postMessage({
        channel: body.channel.id,
        text: 'Cuenta de Google desconectada correctamente. Puedes volver a conectarla ejecutando /calendario.'
      });
    } else {
      await client.chat.postMessage({
        channel: body.channel.id,
        text: 'No se encontro ninguna cuenta de Google conectada.'
      });
    }
  });

  // Handler para ver eventos de hoy
  app.action('view_today_events', async ({ body, ack, client }) => {
    await ack();

    const slackUserId = body.user.id;

    try {
      const service = new GoogleCalendarService();
      await service.initOAuthFromDB(slackUserId);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { events } = await service.getEvents({
        timeMin: today.toISOString(),
        timeMax: tomorrow.toISOString(),
        maxResults: 10
      });

      if (events.length === 0) {
        await client.chat.postMessage({
          channel: body.channel.id,
          text: 'No tienes eventos programados para hoy.'
        });
        return;
      }

      const eventBlocks = events.map(event => {
        const start = event.start.dateTime || event.start.date;
        const time = event.start.dateTime
          ? new Date(start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          : 'Todo el dia';

        return {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${time}* - ${event.summary || '(Sin titulo)'}`
          }
        };
      });

      await client.chat.postMessage({
        channel: body.channel.id,
        text: 'Eventos de hoy',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `Eventos para hoy (${today.toLocaleDateString('es-ES')})`
            }
          },
          ...eventBlocks
        ]
      });
    } catch (error) {
      console.error('[Slack] Error obteniendo eventos:', error.message);
      await client.chat.postMessage({
        channel: body.channel.id,
        text: `Error al obtener eventos: ${error.message}`
      });
    }
  });

  // Handler para el boton de OAuth (no se ejecuta porque tiene URL)
  app.action('google_oauth_start', async ({ ack }) => {
    await ack();
  });
}
