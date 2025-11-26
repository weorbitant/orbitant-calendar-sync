import { Source } from '../../models/Source.js';
import { buildSourceModal, buildDeleteConfirmModal, SOURCE_COLORS } from '../modals/sourceModal.js';

/**
 * Construye los bloques de Slack para mostrar la lista de sources del usuario
 * @param {string} slackUserId - ID del usuario de Slack
 * @returns {Array} Bloques de Slack
 */
export function buildSourcesBlocks(slackUserId) {
  const sources = Source.findBySlackUserId(slackUserId);

  const blocks = [
    { type: 'divider' },
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Calendarios ICS',
        emoji: true
      }
    }
  ];

  if (sources.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No tienes calendarios ICS configurados._'
      }
    });
  } else {
    for (const source of sources) {
      // Encontrar el nombre del color
      const colorInfo = SOURCE_COLORS.find(c => c.value === source.color);
      const colorLabel = colorInfo ? colorInfo.label : '';
      const statusEmoji = source.enabled ? ':white_check_mark:' : ':no_entry_sign:';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${statusEmoji} *${source.name}*${colorLabel ? ` (${colorLabel})` : ''}`
        },
        accessory: {
          type: 'overflow',
          action_id: `source_overflow_${source.id}`,
          options: [
            {
              text: { type: 'plain_text', text: 'Editar', emoji: true },
              value: `edit_${source.id}`
            },
            {
              text: {
                type: 'plain_text',
                text: source.enabled ? 'Desactivar' : 'Activar',
                emoji: true
              },
              value: `toggle_${source.id}`
            },
            {
              text: { type: 'plain_text', text: 'Eliminar', emoji: true },
              value: `delete_${source.id}`
            }
          ]
        }
      });
    }
  }

  // Boton para agregar nuevo source
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Agregar calendario',
          emoji: true
        },
        action_id: 'open_add_source_modal',
        style: 'primary'
      }
    ]
  });

  return blocks;
}

/**
 * Registra todos los action handlers relacionados con sources
 * @param {import('@slack/bolt').App} app - Instancia del bot de Slack
 */
export function registerSourceActions(app) {
  // Handler para abrir el modal de agregar source
  app.action('open_add_source_modal', async ({ body, ack, client }) => {
    await ack();

    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildSourceModal({ mode: 'add' })
      });
    } catch (error) {
      console.error('[Sources] Error abriendo modal:', error.message);
    }
  });

  // Handler para el menu overflow (editar, toggle, eliminar)
  app.action(/^source_overflow_\d+$/, async ({ body, ack, client, action }) => {
    await ack();

    const slackUserId = body.user.id;
    const selectedValue = action.selected_option.value;
    const [actionType, sourceIdStr] = selectedValue.split('_');
    const sourceId = parseInt(sourceIdStr, 10);

    const source = Source.findByIdAndUser(sourceId, slackUserId);

    if (!source) {
      console.warn(`[Sources] Source ${sourceId} no encontrado para usuario ${slackUserId}`);
      return;
    }

    try {
      switch (actionType) {
      case 'edit':
        await client.views.open({
          trigger_id: body.trigger_id,
          view: buildSourceModal({ mode: 'edit', source })
        });
        break;

      case 'toggle': {
        Source.updateForUser(source.id, slackUserId, {
          enabled: source.enabled ? 0 : 1
        });
        const newStatus = source.enabled ? 'desactivado' : 'activado';
        await client.chat.postEphemeral({
          channel: body.channel.id,
          user: slackUserId,
          text: `Calendario "${source.name}" ${newStatus}. Usa /ajustes para ver los cambios.`
        });
        break;
      }

      case 'delete':
        await client.views.open({
          trigger_id: body.trigger_id,
          view: buildDeleteConfirmModal(source)
        });
        break;
      }
    } catch (error) {
      console.error('[Sources] Error procesando accion:', error.message);
    }
  });

  // Handler para el submit del modal de agregar source
  app.view('add_source_submit', async ({ ack, body, view, client }) => {
    const slackUserId = body.user.id;
    const values = view.state.values;

    const name = values.source_name.name_input.value;
    const url = values.source_url.url_input.value;
    const color = values.source_color.color_select?.selected_option?.value || null;

    // Validar formato de URL
    try {
      new URL(url);
    } catch {
      await ack({
        response_action: 'errors',
        errors: {
          source_url: 'URL invalida. Debe ser una URL completa (https://...)'
        }
      });
      return;
    }

    // Verificar si ya existe un source con esta URL para este usuario
    const existingSources = Source.findBySlackUserId(slackUserId);
    const duplicate = existingSources.find(s => s.config?.url === url);
    if (duplicate) {
      await ack({
        response_action: 'errors',
        errors: {
          source_url: 'Ya tienes un calendario con esta URL.'
        }
      });
      return;
    }

    await ack();

    try {
      // Crear el source
      Source.createForUser({
        name,
        type: 'ical_remote',
        config: { url },
        color
      }, slackUserId);

      // Notificar al usuario
      await client.chat.postMessage({
        channel: slackUserId,
        text: `Calendario "${name}" agregado correctamente. Se sincronizara automaticamente.`
      });

      console.log(`[Sources] Source creado: "${name}" para usuario ${slackUserId}`);
    } catch (error) {
      console.error('[Sources] Error creando source:', error.message);
      await client.chat.postMessage({
        channel: slackUserId,
        text: `Error al agregar calendario: ${error.message}`
      });
    }
  });

  // Handler para el submit del modal de editar source
  app.view('edit_source_submit', async ({ ack, body, view, client }) => {
    const slackUserId = body.user.id;
    const values = view.state.values;
    const metadata = JSON.parse(view.private_metadata);

    const name = values.source_name.name_input.value;
    const url = values.source_url.url_input.value;
    const color = values.source_color.color_select?.selected_option?.value || null;

    // Verificar propiedad
    const source = Source.findByIdAndUser(metadata.sourceId, slackUserId);
    if (!source) {
      await ack();
      return;
    }

    // Validar formato de URL
    try {
      new URL(url);
    } catch {
      await ack({
        response_action: 'errors',
        errors: {
          source_url: 'URL invalida. Debe ser una URL completa (https://...)'
        }
      });
      return;
    }

    // Verificar duplicados (excluyendo el source actual)
    const existingSources = Source.findBySlackUserId(slackUserId);
    const duplicate = existingSources.find(s => s.config?.url === url && s.id !== source.id);
    if (duplicate) {
      await ack({
        response_action: 'errors',
        errors: {
          source_url: 'Ya tienes otro calendario con esta URL.'
        }
      });
      return;
    }

    await ack();

    try {
      // Actualizar el source
      Source.updateForUser(source.id, slackUserId, {
        name,
        config: { url },
        color
      });

      // Notificar al usuario
      await client.chat.postMessage({
        channel: slackUserId,
        text: `Calendario "${name}" actualizado correctamente.`
      });

      console.log(`[Sources] Source actualizado: "${name}" (ID: ${source.id})`);
    } catch (error) {
      console.error('[Sources] Error actualizando source:', error.message);
      await client.chat.postMessage({
        channel: slackUserId,
        text: `Error al actualizar calendario: ${error.message}`
      });
    }
  });

  // Handler para confirmar eliminacion
  app.view('delete_source_confirm', async ({ ack, body, view, client }) => {
    const slackUserId = body.user.id;
    const metadata = JSON.parse(view.private_metadata);

    const source = Source.findByIdAndUser(metadata.sourceId, slackUserId);
    if (!source) {
      await ack();
      return;
    }

    await ack();

    try {
      const sourceName = source.name;
      Source.deleteForUser(source.id, slackUserId);

      // Notificar al usuario
      await client.chat.postMessage({
        channel: slackUserId,
        text: `Calendario "${sourceName}" eliminado correctamente.`
      });

      console.log(`[Sources] Source eliminado: "${sourceName}" (ID: ${source.id})`);
    } catch (error) {
      console.error('[Sources] Error eliminando source:', error.message);
      await client.chat.postMessage({
        channel: slackUserId,
        text: `Error al eliminar calendario: ${error.message}`
      });
    }
  });

  console.log('[Sources] Action handlers registrados');
}
