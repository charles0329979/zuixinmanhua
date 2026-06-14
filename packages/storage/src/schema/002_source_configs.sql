-- ============================================================
-- 002_source_configs.sql
-- 书源管理: 配置、域名池、健康日志、搜索日志
-- 从 V1 数据库迁移
-- ============================================================

CREATE TABLE IF NOT EXISTS source_configs (
  source_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'core',
  enabled         INTEGER NOT NULL DEFAULT 1,
  mode            TEXT NOT NULL DEFAULT 'server-parser',
  request_config  TEXT NOT NULL DEFAULT '{}',   -- JSON: {timeout, userAgent, retries}
  policy_config   TEXT NOT NULL DEFAULT '{}',   -- JSON: SourcePolicy
  test_targets    TEXT DEFAULT '{}',            -- JSON: {comicId, chapterId}
  health_status   TEXT NOT NULL DEFAULT 'unknown',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  blocked_until   TEXT,
  last_error      TEXT,
  last_checked_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_domains (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES source_configs(source_id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  last_check_at   TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_check_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL,
  check_type      TEXT NOT NULL,  -- homepage/search/detail/chapter/image
  success         INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  error_message   TEXT,
  details         TEXT,           -- JSON
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_check_logs_source ON source_check_logs(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domains_source ON source_domains(source_id);
