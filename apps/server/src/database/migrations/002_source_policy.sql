-- 002: 书源策略模式 + 熔断字段
-- 为 source_configs 表增加运行模式、策略配置和熔断状态字段

ALTER TABLE source_configs ADD COLUMN mode TEXT NOT NULL DEFAULT 'server-parser';
ALTER TABLE source_configs ADD COLUMN policy_config TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_configs ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE source_configs ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE source_configs ADD COLUMN blocked_until TEXT;
ALTER TABLE source_configs ADD COLUMN last_error TEXT;
ALTER TABLE source_configs ADD COLUMN last_checked_at TEXT;

-- 更新已有书源的模式:
-- server-parser: 已验证可用的书源
-- external-only: 有反爬或已失效的书源
UPDATE source_configs SET mode = 'server-parser',
  policy_config = '{"mode":"server-parser","maxConcurrentRequests":1,"requestTimeoutMs":5000,"cooldownAfterBlockedMs":86400000,"maxImagesPerBatch":6}'
  WHERE source_id IN ('baozi', 'kanman');

UPDATE source_configs SET mode = 'external-only',
  policy_config = '{"mode":"external-only","maxConcurrentRequests":1,"requestTimeoutMs":5000,"cooldownAfterBlockedMs":86400000,"maxImagesPerBatch":6}'
  WHERE source_id IN ('yeman', 'copy', 'dongmanzhijia', 'manwa');
