import { Router } from 'express';
import { getSyncService } from '../services/SyncService.js';

const router = Router();

/**
 * POST /api/sync - Sync all enabled sources
 */
router.post('/', async (req, res) => {
  try {
    const syncService = getSyncService();
    const result = await syncService.syncAll();

    if (result.skipped) {
      return res.status(409).json({
        success: false,
        error: result.reason
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[API] Error syncing all sources:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sync/:sourceId - Sync specific source
 */
router.post('/:sourceId', async (req, res) => {
  try {
    const syncService = getSyncService();
    const result = await syncService.syncSource(parseInt(req.params.sourceId));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[API] Error syncing source:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sync/:sourceId/force - Force full resync for a source
 */
router.post('/:sourceId/force', async (req, res) => {
  try {
    const syncService = getSyncService();
    const result = await syncService.forceResync(parseInt(req.params.sourceId));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[API] Error forcing resync:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sync/status - Get sync status for all sources
 */
router.get('/status', (req, res) => {
  try {
    const syncService = getSyncService();
    const status = syncService.getSyncStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[API] Error getting sync status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
