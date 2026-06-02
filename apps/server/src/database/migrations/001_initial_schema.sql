-- 001_initial_schema.sql
-- 漫画聚合网站 — 书源配置与健康检测系统

CREATE TABLE IF NOT EXISTS source_configs (
  source_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'core',  -- 'core' | 'supplement' | 'disabled'
  enabled         INTEGER NOT NULL DEFAULT 1,
  request_config  TEXT NOT NULL DEFAULT '{"timeout":10000,"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36","retries":2}',
  test_targets    TEXT DEFAULT '{}',             -- JSON: { "comicId": "xxx", "chapterId": "xxx" }
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
  avg_response_time_ms INTEGER DEFAULT NULL,
  last_check_at   TEXT,
  last_success_at TEXT,
  last_error      TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_health_status (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES source_configs(source_id) ON DELETE CASCADE,
  domain          TEXT,
  check_type      TEXT NOT NULL,  -- 'homepage' | 'search' | 'detail' | 'chapter' | 'image'
  is_healthy      INTEGER NOT NULL DEFAULT 0,
  status_code     INTEGER,
  response_time_ms INTEGER,
  error_type      TEXT,
  error_message   TEXT,
  last_check_at   TEXT,
  UNIQUE(source_id, check_type)
);

CREATE TABLE IF NOT EXISTS source_check_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL,
  source_name     TEXT,
  domain          TEXT,
  check_type      TEXT NOT NULL,
  is_healthy      INTEGER NOT NULL DEFAULT 0,
  status_code     INTEGER,
  response_time_ms INTEGER,
  error_type      TEXT,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_search_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  is_success      INTEGER NOT NULL DEFAULT 1,
  result_count    INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_check_logs_source ON source_check_logs(source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_created ON source_search_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_health_status_source ON source_health_status(source_id);

-- ============================================================
-- Seed Data — 初始 5 个书源配置
-- ============================================================

-- 拷贝漫画 (core)
INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config, test_targets) VALUES
('copy', '拷贝漫画', 'core',
 '{"timeout":10000,"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","retries":2}',
 '{"comicId":"123"}');

INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active) VALUES
('copy', 'https://www.mangacopy.com', 0, 1),
('copy', 'https://copymanga.tv', 1, 1);

-- 包子漫画 (core)
INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config, test_targets) VALUES
('baozi', '包子漫画', 'core',
 '{"timeout":10000,"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","retries":2}',
 '{"comicId":"test"}');

INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active) VALUES
('baozi', 'https://www.baozimh.com', 0, 1);

-- 动漫之家 (core)
INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config, test_targets) VALUES
('dongmanzhijia', '动漫之家', 'core',
 '{"timeout":10000,"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","retries":2}',
 '{"comicId":"test"}');

INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active) VALUES
('dongmanzhijia', 'https://www.dmzj.com', 0, 1);

-- 漫蛙 (supplement)
INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config, test_targets) VALUES
('manwa', '漫蛙', 'supplement',
 '{"timeout":15000,"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","retries":3}',
 '{"comicId":"test"}');

INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active) VALUES
('manwa', 'https://manwa.com', 0, 1);

-- 野蛮漫画 (supplement)
INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config, test_targets) VALUES
('yeman', '野蛮漫画', 'supplement',
 '{"timeout":15000,"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","retries":3}',
 '{"comicId":"test"}');

INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active) VALUES
('yeman', 'https://www.yemancomic.com', 0, 1);
