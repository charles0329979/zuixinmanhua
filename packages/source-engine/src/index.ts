// ============================================================
// packages/source-engine/src/index.ts
// ★ Local Search Engine — 独立于 server, 可运行在 Mobile/Web/Server
// ============================================================

export { SearchOrchestrator } from './search-orchestrator';
export { SmartSourceSelector } from './source-selector';
export { SourceHealthTracker } from './health-tracker';
export { ImagePipeline } from './image-pipeline';
export type {
  SearchRequest, SearchBatch, SearchResult,
  SearchOrchestratorOptions, SourceLane,
} from './types';
