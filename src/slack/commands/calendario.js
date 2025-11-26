import { Event } from '../../models/Event.js';
import { Source } from '../../models/Source.js';
import { FeedToken } from '../../models/FeedToken.js';

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
 * Convierte una fecha a string en formato local YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Obtiene el icono de Slack segun el tipo de fuente
 * @param {Object} source
 * @returns {string}
 */
function getSourceIcon(source) {
  if (!source) return '';
  if (source.type === 'google') return ':google-calendar:';
  return ':calendar:';
}

/**
 * Determina si un evento es de todo el dia
 * @param {Object} event
 * @returns {boolean}
 */
function isAllDayEvent(event) {
  return Boolean(event.all_day);
}

/**
 * Obtiene la fecha de inicio de un evento como Date
 * @param {Object} event
 * @returns {Date}
 */
function getEventStartDate(event) {
  return new Date(event.start_datetime);
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
  const startDate = getEventStartDate(event);
  const time = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return time;
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

  const todayStr = toLocalDateString(today);
  const tomorrowStr = toLocalDateString(tomorrow);

  for (const event of events) {
    const eventDate = getEventStartDate(event);
    const eventDateStr = toLocalDateString(eventDate);

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
 * @param {Map} sourceMap - Mapa de source_id a Source
 * @returns {Array}
 */
function buildDayBlocks(emoji, label, date, events, sourceMap) {
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
    const source = sourceMap.get(event.source_id);
    const sourceIcon = getSourceIcon(source);
    return `• ${time}  *${title}* ${sourceIcon}`;
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

    try {
      // Obtener todas las fuentes del usuario (Google + ICS)
      const sources = Source.findBySlackUserId(slackUserId);

      // Verificar si el usuario tiene fuentes configuradas
      if (sources.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: slackUserId,
          text: 'No tienes calendarios configurados.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⚠️ *No tienes calendarios configurados*\n\nUsa `/ajustes` para vincular tu cuenta de Google o añadir calendarios ICS.'
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

      // Crear mapa de fuentes para lookup rapido
      const sourceMap = new Map(sources.map(s => [s.id, s]));
      const sourceIds = sources.map(s => s.id);

      // Calcular rango: desde inicio de hoy hasta fin de manana
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      // Obtener eventos de todas las fuentes
      const events = Event.findBySourceIds(sourceIds, {
        startDate: toLocalDateString(today),
        endDate: toLocalDateString(dayAfterTomorrow)
      });

      // Agrupar eventos por dia
      const { todayEvents, tomorrowEvents } = groupEventsByDay(events, today, tomorrow);

      // Obtener URL del feed si existe
      const feedToken = FeedToken.findBySlackUserId(slackUserId);
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const feedUrl = feedToken ? `${baseUrl}/feed/${feedToken.token}/orbitando.ics` : null;

      // Si no hay eventos
      if (todayEvents.length === 0 && tomorrowEvents.length === 0) {
        const noEventsFooter = feedUrl
          ? `📅 *Google Calendar Service*\niCal: \`${feedUrl}\``
          : '📅 *Google Calendar Service*';

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
                text: noEventsFooter
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
        const todayBlocks = buildDayBlocks('📌', 'HOY', today, todayEvents, sourceMap);
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
        const tomorrowBlocks = buildDayBlocks('📆', 'MAÑANA', tomorrow, tomorrowEvents, sourceMap);
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

      // Footer con resumen y URL del feed
      const totalEvents = todayEvents.length + tomorrowEvents.length;
      const footerText = feedUrl
        ? `*${totalEvents} evento(s)* en total\niCal: \`${feedUrl}\``
        : `*${totalEvents} evento(s)* en total`;

      blocks.push(
        { type: 'divider' },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: footerText
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
