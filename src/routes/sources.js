import { Router } from 'express';
import { Source } from '../models/Source.js';

const router = Router();

/**
 * GET /api/sources - List all sources
 */
router.get('/', (req, res) => {
  try {
    const sources = Source.findAll();
    res.json({
      success: true,
      data: sources.map(s => s.toJSON())
    });
  } catch (error) {
    console.error('[API] Error listing sources:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sources/:id - Get source by ID
 */
router.get('/:id', (req, res) => {
  try {
    const source = Source.findById(req.params.id);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }
    res.json({
      success: true,
      data: source.toJSON()
    });
  } catch (error) {
    console.error('[API] Error getting source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sources - Create new source
 * Body: { name, type, config, enabled?, color? }
 */
router.post('/', (req, res) => {
  try {
    const { name, type, config, enabled, color } = req.body;

    // Validation
    if (!name || !type || !config) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, type, config'
      });
    }

    const validTypes = ['google', 'ical_remote', 'ical_local'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate config based on type
    const configValidation = validateConfig(type, config);
    if (!configValidation.valid) {
      return res.status(400).json({
        success: false,
        error: configValidation.error
      });
    }

    const source = Source.create({ name, type, config, enabled, color });
    res.status(201).json({
      success: true,
      data: source.toJSON()
    });
  } catch (error) {
    console.error('[API] Error creating source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/sources/:id - Update source
 */
router.put('/:id', (req, res) => {
  try {
    const source = Source.findById(req.params.id);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }

    const { name, type, config, enabled, color } = req.body;

    // Validate type if provided
    if (type) {
      const validTypes = ['google', 'ical_remote', 'ical_local'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
        });
      }
    }

    // Validate config if provided
    if (config && type) {
      const configValidation = validateConfig(type, config);
      if (!configValidation.valid) {
        return res.status(400).json({
          success: false,
          error: configValidation.error
        });
      }
    }

    const updated = Source.update(req.params.id, { name, type, config, enabled, color });
    res.json({
      success: true,
      data: updated.toJSON()
    });
  } catch (error) {
    console.error('[API] Error updating source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sources/:id - Delete source
 */
router.delete('/:id', (req, res) => {
  try {
    const source = Source.findById(req.params.id);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }

    Source.delete(req.params.id);
    res.json({
      success: true,
      message: 'Source deleted successfully'
    });
  } catch (error) {
    console.error('[API] Error deleting source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Validate config based on source type
 */
function validateConfig(type, config) {
  switch (type) {
    case 'google':
      // calendarId is optional (defaults to 'primary')
      return { valid: true };

    case 'ical_remote':
      if (!config.url) {
        return { valid: false, error: 'config.url is required for ical_remote type' };
      }
      try {
        new URL(config.url);
      } catch {
        return { valid: false, error: 'config.url must be a valid URL' };
      }
      return { valid: true };

    case 'ical_local':
      if (!config.path) {
        return { valid: false, error: 'config.path is required for ical_local type' };
      }
      return { valid: true };

    default:
      return { valid: false, error: 'Unknown type' };
  }
}

export default router;
