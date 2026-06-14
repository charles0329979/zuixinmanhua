// ============================================================
// packages/source-core/src/index.ts
// Barrel export — Source Core
// ============================================================

// ---- Interfaces ----
export type { ISourceStore } from './source-catalog';

// ---- Adapters ----
export { BaseAdapter } from './adapters/base.adapter';
export { BaoziAdapter } from './adapters/baozi';
export { KanmanAdapter } from './adapters/kanman';
export { ManwaAdapter } from './adapters/manwa';
export { YemanAdapter } from './adapters/yeman';
export { CopyAdapter } from './adapters/copy';

// ---- Factory ----
export { AdapterFactory } from './adapter-factory';

// ---- Catalog ----
export { SourceCatalog } from './source-catalog';

// ---- Rule Engine ----
export { RuleBasedAdapter } from './rule-engine/rule-based-adapter';
export { resolveSearchUrl, resolveUrl, cleanHost } from './rule-engine/url-resolver';

// ---- Search ----
export { SearchOrchestrator } from './search-orchestrator';
export type { SearchOrchestratorOptions } from './search-orchestrator';

// ---- ComicFS ----
export {
  fetchManifest, fetchIndex, fetchAdConfig,
  fetchSourceHealth, fetchSourceById,
} from './comicfs/client';
export { getActiveSources, getSourceById } from './comicfs/source-loader';
export type { ActiveSourceFilter, RemoteSourceDisplay } from './comicfs/source-loader';
