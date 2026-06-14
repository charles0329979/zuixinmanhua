// ============================================================
// packages/types/src/index.ts
// Barrel export — all shared types
// ============================================================

// ---- adapter ----
export type {
  ComicInfo,
  ComicStatus,
  ChapterInfo,
  ChapterDetail,
  AdapterContext,
  ISourceAdapter,
} from './adapter';

// ---- source ----
export type {
  SourceMode,
  SourcePolicy,
  SourceSearchRule,
  SourceDetailRule,
  SourceChapterRule,
  SourceImageRule,
  MangaSource,
} from './source';
export { DEFAULT_SOURCE_POLICY } from './source';

// ---- search ----
export type {
  AggregatedComicResult,
  SearchSourceError,
  SearchOptions,
  AggregatedSearchResponse,
  AggregatedSourceResult,
  MangaSearchResult,
  SearchResponse,
} from './search';

// ---- storage ----
export type {
  FavoriteComic,
  ReadingProgress,
  BrowseHistoryItem,
  AppSettings,
} from './storage';

// ---- health ----
export type {
  SourceHealthStatus,
  SourceHealth,
  HealthCheckType,
  HealthCheckResult,
} from './health';
export { CircuitBreakerError, detectBlockPattern } from './health';

// ---- comicfs ----
export type {
  ComicfsManifest,
  ComicfsSourceSummary,
  ComicfsIndex,
  ComicfsAdConfig,
  ComicfsSourceRule,
  ComicfsSourceSection,
  ComicfsSource,
  ComicfsSourceHealthItem,
  ComicfsSourceHealth,
} from './comicfs';
export { ComicfsNetworkError, ComicfsParseError } from './comicfs';
