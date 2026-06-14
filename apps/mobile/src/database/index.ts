// ============================================================
// apps/mobile/src/database/index.ts
// SQLite 数据库初始化 — 使用 expo-sqlite
// ============================================================

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'comic-reader.db';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync(DB_NAME);

  // Enable WAL mode for better concurrent reads
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Run migrations
  await migrate(db);

  return db;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  // Create migrations table if not exists
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (
      await database.getAllAsync<{ name: string }>(
        'SELECT name FROM _migrations',
      )
    ).map((r) => r.name),
  );

  const migrations = [
    {
      name: '001_library',
      sql: `
        CREATE TABLE IF NOT EXISTS favorites (
          id TEXT PRIMARY KEY,
          comic_id TEXT NOT NULL,
          title TEXT NOT NULL,
          author TEXT,
          cover TEXT,
          source TEXT NOT NULL,
          last_chapter TEXT,
          status TEXT DEFAULT 'ongoing',
          added_at INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS reading_progress (
          id TEXT PRIMARY KEY,
          comic_id TEXT NOT NULL,
          comic_title TEXT NOT NULL,
          source TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          chapter_title TEXT,
          page_index INTEGER NOT NULL DEFAULT 0,
          cover TEXT,
          last_read_at INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS browse_history (
          id TEXT PRIMARY KEY,
          comic_id TEXT NOT NULL,
          title TEXT NOT NULL,
          source TEXT NOT NULL,
          cover TEXT,
          chapter_title TEXT,
          chapter_url TEXT,
          page_index INTEGER NOT NULL DEFAULT 0,
          last_read_at INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_progress_last_read ON reading_progress(last_read_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_last_read ON browse_history(last_read_at DESC);
        CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);
      `,
    },
  ];

  for (const m of migrations) {
    if (!applied.has(m.name)) {
      await database.execAsync(m.sql);
      await database.runAsync(
        'INSERT INTO _migrations (name) VALUES (?)',
        m.name,
      );
      console.log(`[DB] Migration applied: ${m.name}`);
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
