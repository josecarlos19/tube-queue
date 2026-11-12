import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS channels (
    channel_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    handle TEXT,
    thumbnail_url TEXT,
    uploads_playlist_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    last_synced_at TEXT,
    sync_error TEXT
  );
  CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT,
    published_at TEXT,
    cached_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS videos_published_idx ON videos(published_at DESC);
  CREATE INDEX IF NOT EXISTS videos_channel_idx ON videos(channel_id);
  CREATE TABLE IF NOT EXISTS watch_history (
    video_id TEXT PRIMARY KEY REFERENCES videos(video_id) ON DELETE CASCADE,
    first_opened_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    playback_state TEXT NOT NULL DEFAULT 'opened',
    manually_watched INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS history_activity_idx ON watch_history(last_activity_at DESC);
  CREATE TABLE IF NOT EXISTS play_queue (
    video_id TEXT PRIMARY KEY REFERENCES videos(video_id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
  );
  DELETE FROM settings WHERE substr(setting_key, 1, 6) = 'oauth_';
`;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dataDir, 0o700);
  } catch {}
  const databasePath = path.join(dataDir, 'tubequeue.sqlite');
  const db = new DatabaseSync(databasePath);
  try {
    fs.chmodSync(databasePath, 0o600);
  } catch {}
  db.exec(schema);
  return db;
}

export function openMemoryDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  return db;
}
