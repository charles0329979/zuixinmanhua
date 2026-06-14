-- ============================================================
-- 001_library.sql
-- 用户数据: 收藏、阅读进度、历史、设置
-- ============================================================

CREATE TABLE IF NOT EXISTS favorites (
  id              TEXT PRIMARY KEY,  -- "source:comicId"
  comic_id        TEXT NOT NULL,
  title           TEXT NOT NULL,
  author          TEXT,
  cover           TEXT,
  source          TEXT NOT NULL,
  last_chapter    TEXT,
  status          TEXT DEFAULT 'ongoing',
  added_at        INTEGER NOT NULL,  -- Unix timestamp ms
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id              TEXT PRIMARY KEY,  -- "source:comicId"
  comic_id        TEXT NOT NULL,
  comic_title     TEXT NOT NULL,
  source          TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  chapter_title   TEXT,
  page_index      INTEGER NOT NULL DEFAULT 0,
  cover           TEXT,
  last_read_at    INTEGER NOT NULL,  -- Unix timestamp ms
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browse_history (
  id              TEXT PRIMARY KEY,  -- auto-generated UUID
  comic_id        TEXT NOT NULL,
  title           TEXT NOT NULL,
  source          TEXT NOT NULL,
  cover           TEXT,
  chapter_title   TEXT,
  chapter_url     TEXT,
  page_index      INTEGER NOT NULL DEFAULT 0,
  last_read_at    INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,     -- JSON string
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_progress_last_read ON reading_progress(last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_last_read ON browse_history(last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);
