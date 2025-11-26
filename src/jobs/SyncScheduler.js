import { CronJob } from 'cron';
import { getSyncService } from '../services/SyncService.js';

/**
 * Scheduler for automatic calendar synchronization
 */
export class SyncScheduler {
  constructor(options = {}) {
    this.cronExpression = options.cronExpression || process.env.SYNC_CRON || '0 */15 * * * *'; // Every 15 minutes
    this.timezone = options.timezone || 'UTC';
    this.syncOnStartup = options.syncOnStartup ?? (process.env.SYNC_ON_STARTUP !== 'false');
    this.job = null;
    this.running = false;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.job) {
      console.log('[SyncScheduler] Scheduler already running');
      return;
    }

    console.log(`[SyncScheduler] Starting with cron: ${this.cronExpression}`);

    this.job = new CronJob(
      this.cronExpression,
      async () => {
        await this.runSync();
      },
      null,
      true,
      this.timezone
    );

    this.running = true;
    console.log('[SyncScheduler] Scheduler started');

    // Run initial sync if configured
    if (this.syncOnStartup) {
      console.log('[SyncScheduler] Running initial sync on startup');
      // Delay startup sync slightly to allow server to fully initialize
      setTimeout(() => this.runSync(), 5000);
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      this.running = false;
      console.log('[SyncScheduler] Scheduler stopped');
    }
  }

  /**
   * Run synchronization
   */
  async runSync() {
    console.log('[SyncScheduler] Running scheduled sync...');

    try {
      const syncService = getSyncService();
      const result = await syncService.syncAll();

      if (result.skipped) {
        console.log('[SyncScheduler] Sync skipped:', result.reason);
      } else {
        console.log(`[SyncScheduler] Sync completed: ${result.success.length} success, ${result.failed.length} failed`);
      }
    } catch (error) {
      console.error('[SyncScheduler] Sync failed:', error.message);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.running,
      cronExpression: this.cronExpression,
      timezone: this.timezone,
      nextRun: this.job ? this.job.nextDate().toISO() : null
    };
  }

  /**
   * Manually trigger a sync
   */
  async triggerSync() {
    return this.runSync();
  }
}

// Singleton instance
let instance = null;

export function getSyncScheduler(options) {
  if (!instance) {
    instance = new SyncScheduler(options);
  }
  return instance;
}

export default SyncScheduler;
