// ============================================================
// packages/storage/src/index.ts
// Barrel export — Storage Layer
// ============================================================

export type { IDatabase } from './db-interface';

export { FavoritesRepository } from './repositories/favorites-repo';
export { ProgressRepository } from './repositories/progress-repo';
export { HistoryRepository } from './repositories/history-repo';
export { SettingsRepository } from './repositories/settings-repo';

export { SqljsAdapter } from './adapters/sqljs-adapter';
export { OpSqliteAdapter } from './adapters/op-sqlite-adapter';
