import { Event } from '../../models/Event.js';
import { Source } from '../../models/Source.js';
import { FeedToken } from '../../models/FeedToken.js';
import { OAuthToken } from '../../models/OAuthToken.js';
import {
  fetchUserTimezone,
  formatTimeInZone,
  formatDateInZone,
  getTodayInZone,
  getDateRelativeToToday
} from '../../utils/timezone.js';
import { DateTime } from 'luxon';

/**
 * Formatea una fecha para mostrar el dia de la semana y fecha
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @param {string} timezone - IANA timezone identifier
 * @returns {string}
 */
function formatDayHeader(dateStr, timezone) {
  const dt = DateTime.fromISO(dateStr).setZone(timezone);
  const dayName = dt.setLocale('es').toFormat('cccc');
  const day = dt.day;
  const month = dt.setLocale('es').toFormat('MMMM');

  // Capitalizar primera letra
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);

  return `${capitalizedDay}, ${day} de ${capitalizedMonth}`;
}

/**
 * Obtiene el icono de Slack segun el tipo de fuente
 * @param {Object} source
 * @returns {string}
 */
function getSourceIcon(source) {
  if (!source) return '';
  if (source.type === 'google') return ':google-calendar:';
  if (source.type === 'microsoft') return ':ms_outlook:';
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
 * Formatea la hora de un evento
 * @param {Object} event
 * @param {string} timezone - IANA timezone identifier
 * @returns {string}
 */
function formatEventTime(event, timezone) {
  if (isAllDayEvent(event)) {
    return '🌅 Todo el día';
  }
  return formatTimeInZone(event.start_datetime, timezone, 'HH:mm');
}

/**
 * Agrupa eventos por dia (hoy o manana) usando timezone del usuario
 * @param {Array} events
 * @param {string} todayStr - Fecha de hoy en formato YYYY-MM-DD
 * @param {string} tomorrowStr - Fecha de manana en formato YYYY-MM-DD
 * @param {string} timezone - IANA timezone identifier
 * @returns {{ todayEvents: Array, tomorrowEvents: Array }}
 */
function groupEventsByDay(events, todayStr, tomorrowStr, timezone) {
  const todayEvents = [];
  const tomorrowEvents = [];

  for (const event of events) {
    const eventDateStr = formatDateInZone(event.start_datetime, timezone);

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
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @param {Array} events
 * @param {Map} sourceMap - Mapa de source_id a Source
 * @param {string} timezone - IANA timezone identifier
 * @returns {Array}
 */
function buildDayBlocks(emoji, label, dateStr, events, sourceMap, timezone) {
  if (events.length === 0) {
    return [];
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${label}*  •  _${formatDayHeader(dateStr, timezone)}_`
      }
    }
  ];

  const eventLines = events.map(event => {
    const time = formatEventTime(event, timezone);
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
    console.log(`[Slack] /calendario invoked by user ${slackUserId} @${command.user_name}`);
    
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

      // Obtener timezone del usuario (de BD o de Slack)
      let userTimezone = OAuthToken.getTimezone(slackUserId);

      // Si no tiene timezone o tiene el default 'UTC', obtenerlo de Slack
      if (!userTimezone || userTimezone === 'UTC') {
        const slackTimezone = await fetchUserTimezone(client, slackUserId);
        if (slackTimezone && slackTimezone !== 'UTC') {
          // Solo actualizar si Slack devuelve un timezone diferente a UTC
          userTimezone = slackTimezone;
          OAuthToken.updateTimezone(slackUserId, userTimezone);
          console.log(`[Slack] Timezone for user ${slackUserId}: ${userTimezone} (updated from Slack)`);
        } else {
          // Slack devolvió UTC o error - mantener lo que tenemos
          userTimezone = userTimezone || 'UTC';
          console.log(`[Slack] Timezone for user ${slackUserId}: ${userTimezone} (from Slack API)`);
        }
      }

      // Calcular rango usando timezone del usuario
      const todayStr = getTodayInZone(userTimezone);
      const tomorrowStr = getDateRelativeToToday(userTimezone, 1);
      const dayAfterTomorrowStr = getDateRelativeToToday(userTimezone, 2);

      // Obtener eventos de todas las fuentes
      const events = Event.findBySourceIds(sourceIds, {
        startDate: todayStr,
        endDate: dayAfterTomorrowStr
      });

      // Agrupar eventos por dia usando timezone
      const { todayEvents, tomorrowEvents } = groupEventsByDay(events, todayStr, tomorrowStr, userTimezone);

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
        const todayBlocks = buildDayBlocks('📌', 'HOY', todayStr, todayEvents, sourceMap, userTimezone);
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
        const tomorrowBlocks = buildDayBlocks('📆', 'MAÑANA', tomorrowStr, tomorrowEvents, sourceMap, userTimezone);
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
