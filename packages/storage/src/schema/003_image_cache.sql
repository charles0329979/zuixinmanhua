-- ============================================================
-- 003_image_cache.sql (NEW)
-- 图片缓存元数据 — 支持本地文件 + CDN 双轨缓存
-- ============================================================

CREATE TABLE IF NOT EXISTS image_cache (
  url_hash        TEXT PRIMARY KEY,  -- SHA256 of original URL
  original_url    TEXT NOT NULL,
  source_id       TEXT,
  local_path      TEXT,              -- 本地文件路径 (server), null if cloud-only
  cdn_url         TEXT,              -- CDN URL (if uploaded)
  file_size       INTEGER,           -- bytes
  mime_type       TEXT,
  width           INTEGER,
  height          INTEGER,
  etag            TEXT,
  last_modified   TEXT,
  expires_at      TEXT,              -- 缓存过期时间 ISO 8601
  hit_count       INTEGER NOT NULL DEFAULT 0,
  last_hit_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_image_cache_expires ON image_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_image_cache_source ON image_cache(source_id);
