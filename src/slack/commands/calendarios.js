import { getGoogleAuthUrl } from '../actions/oauth.js';

/**
 * Registra el comando /calendarios en el bot de Slack
 * @param {import('@slack/bolt').App} app - Instancia del bot de Slack
 */
export function registerCalendariosCommand(app) {
  app.command('/calendario', async ({ command, ack, client }) => {
    // Acknowledge el comando inmediatamente
    await ack();

    // Verificar si ya hay token de Google configurado
    const hasGoogleToken = !!process.env.GOOGLE_REFRESH_TOKEN;

    if (hasGoogleToken) {
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
              text: '*Google Calendar conectado*\n\nTu cuenta de Google Calendar esta vinculada correctamente.'
            },
            accessory: {
              type: 'image',
              image_url: 'https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png',
              alt_text: 'Google Calendar'
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '_Proximamente: ver eventos, crear recordatorios y mas..._'
              }
            ]
          }
        ]
      });
    } else {
      // No autenticado - mostrar boton de OAuth
      const authUrl = getGoogleAuthUrl();

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
                text: '_Al hacer clic seras redirigido a Google para autorizar el acceso a tu calendario._'
              }
            ]
          }
        ]
      });
    }
  });

  // Handler para cuando se hace clic en el boton (opcional, el boton con URL no dispara action)
  app.action('google_oauth_start', async ({ ack }) => {
    await ack();
    // El boton con URL abre directamente el enlace, no se ejecuta este handler
  });
}
