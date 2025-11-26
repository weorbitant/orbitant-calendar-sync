import { OAuthToken } from '../../models/OAuthToken.js';
import GoogleCalendarService from '../../services/google-calendar.js';

/**
 * Formatea una fecha para mostrar el dia de la semana y fecha
 * @param {Date} date
 * @returns {string}
 */
function formatDayHeader(date) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const dayName = dayNames[date.getDay()];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];

  return `${dayName}, ${day} de ${month}`;
}

/**
 * Determina si un evento es de todo el dia
 * @param {Object} event
 * @returns {boolean}
 */
function isAllDayEvent(event) {
  return !event.start.dateTime && event.start.date;
}

/**
 * Obtiene la fecha de inicio de un evento como Date
 * @param {Object} event
 * @returns {Date}
 */
function getEventStartDate(event) {
  if (event.start.dateTime) {
    return new Date(event.start.dateTime);
  }
  // Para eventos de todo el dia, la fecha viene como YYYY-MM-DD
  return new Date(event.start.date + 'T00:00:00');
}

/**
 * Formatea la hora de un evento
 * @param {Object} event
 * @returns {string}
 */
function formatEventTime(event) {
  if (isAllDayEvent(event)) {
    return '🌅 Todo el día';
  }
  const startDate = new Date(event.start.dateTime);
  const time = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `🕐 ${time}`;
}

/**
 * Agrupa eventos por dia (hoy o manana)
 * @param {Array} events
 * @param {Date} today
 * @param {Date} tomorrow
 * @returns {{ todayEvents: Array, tomorrowEvents: Array }}
 */
function groupEventsByDay(events, today, tomorrow) {
  const todayEvents = [];
  const tomorrowEvents = [];

  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  for (const event of events) {
    const eventDate = getEventStartDate(event);
    const eventDateStr = eventDate.toISOString().split('T')[0];

    if (eventDateStr === todayStr) {
      todayEvents.push(event);
    } else if (eventDateStr === tomorrowStr) {
      tomorrowEvents.push(event);
    }
  }

  return { todayEvents, tomorrowEvents };
}

/**
 * Construye los bloques de Slack para mostrar eventos de un dia
 * @param {string} emoji - Emoji para el encabezado
 * @param {string} label - "HOY" o "MAÑANA"
 * @param {Date} date
 * @param {Array} events
 * @returns {Array}
 */
function buildDayBlocks(emoji, label, date, events) {
  if (events.length === 0) {
    return [];
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${label}*  •  _${formatDayHeader(date)}_`
      }
    }
  ];

  const eventLines = events.map(event => {
    const time = formatEventTime(event);
    const title = event.summary || '(Sin título)';
    return `     ${time}  *${title}*`;
  });

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: eventLines.join('\n')
    }]
  });

  return blocks;
}

/**
 * Registra el comando /calendario en el bot de Slack
 * @param {import('@slack/bolt').App} app - Instancia del bot de Slack
 */
export function registerCalendarioCommand(app) {
  app.command('/calendario', async ({ command, ack, client }) => {
    await ack();

    const slackUserId = command.user_id;

    // Verificar si el usuario tiene tokens en la BD
    const tokenRecord = OAuthToken.findBySlackUserId(slackUserId, 'google');
    const hasValidTokens = tokenRecord && tokenRecord.refreshToken;

    if (!hasValidTokens) {
      // No autenticado - indicar que use /ajustes
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: slackUserId,
        text: 'No tienes una cuenta de Google Calendar conectada.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⚠️ *No tienes una cuenta de Google Calendar conectada*\n\nUsa `/ajustes` para vincular tu cuenta de Google.'
            }
          },
          { type: 'divider' },
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: '📅 *Google Calendar Service*'
            }]
          }
        ]
      });
      return;
    }

    try {
      const service = new GoogleCalendarService();
      await service.initOAuthFromDB(slackUserId);

      // Calcular rango: desde inicio de hoy hasta fin de manana
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const { events } = await service.getEvents({
        timeMin: today.toISOString(),
        timeMax: dayAfterTomorrow.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      // Agrupar eventos por dia
      const { todayEvents, tomorrowEvents } = groupEventsByDay(events, today, tomorrow);

      // Si no hay eventos
      if (todayEvents.length === 0 && tomorrowEvents.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: slackUserId,
          text: 'No tienes eventos programados.',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📅 Tu Calendario',
                emoji: true
              }
            },
            { type: 'divider' },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '🎉 *¡Agenda libre!*\n\nNo tienes eventos programados para hoy ni mañana.'
              }
            },
            { type: 'divider' },
            {
              type: 'context',
              elements: [{
                type: 'mrkdwn',
                text: '📅 *Google Calendar Service*'
              }]
            }
          ]
        });
        return;
      }

      // Construir bloques de eventos
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📅 Tu Calendario',
            emoji: true
          }
        },
        { type: 'divider' }
      ];

      // Eventos de hoy
      if (todayEvents.length > 0) {
        const todayBlocks = buildDayBlocks('📌', 'HOY', today, todayEvents);
        blocks.push(...todayBlocks);
      } else {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: '📌 *HOY*  •  _Sin eventos programados_'
          }]
        });
      }

      // Separador
      blocks.push({ type: 'divider' });

      // Eventos de manana
      if (tomorrowEvents.length > 0) {
        const tomorrowBlocks = buildDayBlocks('📆', 'MAÑANA', tomorrow, tomorrowEvents);
        blocks.push(...tomorrowBlocks);
      } else {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: '📆 *MAÑANA*  •  _Sin eventos programados_'
          }]
        });
      }

      // Footer con resumen
      const totalEvents = todayEvents.length + tomorrowEvents.length;
      blocks.push(
        { type: 'divider' },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `📊 *${totalEvents} evento(s)* en total  •  📅 *Google Calendar Service*`
          }]
        }
      );

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: slackUserId,
        text: 'Tu calendario',
        blocks
      });

    } catch (error) {
      console.error('[Slack] Error obteniendo eventos:', error.message);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: slackUserId,
        text: `❌ Error al obtener eventos: ${error.message}`
      });
    }
  });
}
