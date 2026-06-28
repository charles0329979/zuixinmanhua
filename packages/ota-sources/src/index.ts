// ============================================================
// packages/ota-sources/src/index.ts
// ★ OTA Source Registry — 源下发、增量同步、本地缓存、验证
// ============================================================

export { SourceRegistry } from './registry';
export { SourceSyncer } from './sync';
export { SourceCache } from './cache';
export { validateSource, validateAllSources } from './validator';
export type { RegistryManifest, SyncResult, CacheEntry } from './types';
