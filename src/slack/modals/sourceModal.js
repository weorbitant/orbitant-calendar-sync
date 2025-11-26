/**
 * Colores predefinidos para calendarios
 */
export const SOURCE_COLORS = [
  { value: '#4285F4', label: 'Azul' },
  { value: '#DB4437', label: 'Rojo' },
  { value: '#F4B400', label: 'Amarillo' },
  { value: '#0F9D58', label: 'Verde' },
  { value: '#AB47BC', label: 'Morado' },
  { value: '#00ACC1', label: 'Turquesa' },
  { value: '#FF7043', label: 'Naranja' },
  { value: '#9E9E9E', label: 'Gris' }
];

/**
 * Construye el modal para agregar/editar un source de calendario
 * @param {Object} options
 * @param {'add'|'edit'} options.mode - Modo del modal
 * @param {Object} [options.source] - Source existente para modo editar
 * @returns {Object} Vista de modal de Slack
 */
export function buildSourceModal({ mode = 'add', source = null }) {
  const isEdit = mode === 'edit' && source;

  // Encontrar la opcion de color inicial si existe
  let initialColorOption = null;
  if (isEdit && source.color) {
    const colorMatch = SOURCE_COLORS.find(c => c.value === source.color);
    if (colorMatch) {
      initialColorOption = {
        text: { type: 'plain_text', text: colorMatch.label },
        value: colorMatch.value
      };
    }
  }

  // Construir el elemento select de color
  const colorSelectElement = {
    type: 'static_select',
    action_id: 'color_select',
    placeholder: {
      type: 'plain_text',
      text: 'Selecciona un color'
    },
    options: SOURCE_COLORS.map(color => ({
      text: {
        type: 'plain_text',
        text: color.label,
        emoji: true
      },
      value: color.value
    }))
  };

  // Solo agregar initial_option si existe
  if (initialColorOption) {
    colorSelectElement.initial_option = initialColorOption;
  }

  return {
    type: 'modal',
    callback_id: isEdit ? 'edit_source_submit' : 'add_source_submit',
    private_metadata: isEdit ? JSON.stringify({ sourceId: source.id }) : '',
    title: {
      type: 'plain_text',
      text: isEdit ? 'Editar calendario' : 'Agregar calendario',
      emoji: true
    },
    submit: {
      type: 'plain_text',
      text: isEdit ? 'Guardar' : 'Agregar',
      emoji: true
    },
    close: {
      type: 'plain_text',
      text: 'Cancelar',
      emoji: true
    },
    blocks: [
      {
        type: 'input',
        block_id: 'source_name',
        element: {
          type: 'plain_text_input',
          action_id: 'name_input',
          placeholder: {
            type: 'plain_text',
            text: 'Ej: Calendario de trabajo'
          },
          initial_value: isEdit ? source.name : undefined,
          max_length: 100
        },
        label: {
          type: 'plain_text',
          text: 'Nombre',
          emoji: true
        }
      },
      {
        type: 'input',
        block_id: 'source_url',
        element: {
          type: 'url_text_input',
          action_id: 'url_input',
          placeholder: {
            type: 'plain_text',
            text: 'https://calendar.google.com/calendar/ical/...'
          },
          initial_value: isEdit ? source.config?.url : undefined
        },
        label: {
          type: 'plain_text',
          text: 'URL del calendario (ICS)',
          emoji: true
        },
        hint: {
          type: 'plain_text',
          text: 'URL publica del archivo .ics del calendario'
        }
      },
      {
        type: 'input',
        block_id: 'source_color',
        optional: true,
        element: colorSelectElement,
        label: {
          type: 'plain_text',
          text: 'Color',
          emoji: true
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: ':information_source: Los calendarios ICS se sincronizan automaticamente cada 15 minutos.'
          }
        ]
      }
    ]
  };
}

/**
 * Construye el modal de confirmacion de eliminacion
 * @param {Object} source - Source a eliminar
 * @returns {Object} Vista de modal de Slack
 */
export function buildDeleteConfirmModal(source) {
  return {
    type: 'modal',
    callback_id: 'delete_source_confirm',
    private_metadata: JSON.stringify({ sourceId: source.id }),
    title: {
      type: 'plain_text',
      text: 'Eliminar calendario',
      emoji: true
    },
    submit: {
      type: 'plain_text',
      text: 'Eliminar',
      emoji: true
    },
    close: {
      type: 'plain_text',
      text: 'Cancelar',
      emoji: true
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *Estas seguro de eliminar el calendario "${source.name}"?*\n\nEsta accion no se puede deshacer. Se eliminaran todos los eventos sincronizados de este calendario.`
        }
      }
    ]
  };
}
