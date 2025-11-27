import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Get database instance (singleton)
 */
export function getDatabase() {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || './data/calendar.db';
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * Initialize database schema
 */
export function initializeDatabase() {
  const database = getDatabase();
  const schemaPath = join(__dirname, '../database/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);

  // Run migrations
  runMigrations(database);

  console.log('Database initialized successfully');
}

/**
 * Run database migrations
 */
function runMigrations(database) {
  // Migration: Add timezone column to oauth_tokens if not exists
  const columns = database.prepare('PRAGMA table_info(oauth_tokens)').all();
  const hasTimezone = columns.some(col => col.name === 'timezone');

  if (!hasTimezone) {
    database.exec('ALTER TABLE oauth_tokens ADD COLUMN timezone TEXT DEFAULT \'UTC\'');
    console.log('Migration: Added timezone column to oauth_tokens');
  }
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { getDatabase, initializeDatabase, closeDatabase };
