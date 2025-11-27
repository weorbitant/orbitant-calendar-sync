-- Schema para el servicio de calendario multi-fuente

-- Tabla: sources (fuentes de calendario)
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('google', 'ical_remote', 'ical_local', 'microsoft')),
    config TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    color TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Tabla: events (eventos de todas las fuentes)
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    summary TEXT,
    description TEXT,
    location TEXT,
    start_datetime TEXT NOT NULL,
    end_datetime TEXT,
    all_day INTEGER DEFAULT 0,
    status TEXT,
    recurrence TEXT,
    raw_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    UNIQUE(source_id, external_id)
);

-- Tabla: sync_state (estado de sincronizacion por fuente)
CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL UNIQUE,
    sync_token TEXT,
    etag TEXT,
    last_sync TEXT,
    last_sync_status TEXT CHECK(last_sync_status IN ('success', 'error', 'pending')),
    last_error TEXT,
    events_count INTEGER DEFAULT 0,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

-- Indices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_sync_state_source ON sync_state(source_id);
CREATE INDEX IF NOT EXISTS idx_sources_slack_user ON sources(slack_user_id);

-- Tabla: oauth_tokens (tokens OAuth por usuario de Slack)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    slack_team_id TEXT,
    slack_user_name TEXT,
    provider TEXT NOT NULL DEFAULT 'google' CHECK(provider IN ('google', 'microsoft')),
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    expires_at INTEGER,
    account_email TEXT,
    timezone TEXT DEFAULT 'UTC',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(slack_user_id, provider)
);

-- Migracion: agregar columna timezone si no existe
-- SQLite no soporta ADD COLUMN IF NOT EXISTS, se maneja en codigo

-- Indices para oauth_tokens
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_slack_user ON oauth_tokens(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);

-- Tabla: feed_tokens (tokens unicos para acceder al feed iCal)
CREATE TABLE IF NOT EXISTS feed_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT
);

-- Indices para feed_tokens
CREATE INDEX IF NOT EXISTS idx_feed_tokens_token ON feed_tokens(token);
CREATE INDEX IF NOT EXISTS idx_feed_tokens_slack_user ON feed_tokens(slack_user_id);
