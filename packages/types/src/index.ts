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

// ---- source-origin (V4 import pipeline) ----
export type {
  SourceImportProvider,
  SourceOrigin,
  SourceCapabilities,
  SourceLifecycleStatus,
} from './source-origin';
export {
  VALID_TRANSITIONS,
  isValidTransition,
  STATUS_LABELS,
} from './source-origin';

// ---- source-canonical (V4 normalize format) ----
export type {
  CanonicalRuleSection,
  CanonicalSourceDefinition,
  FieldMapping,
  UnmappedField,
  ExternalFormatType,
  FormatDetectionResult,
} from './source-canonical';

// ---- source-validation (V4 validation + candidate) ----
export type {
  SourceValidationResult,
  StaticLintDetail,
  NetworkCheckDetail,
  SearchCheckDetail,
  ChainCheckDetail,
  SourceHealthScore,
  ImportedSourceCandidate,
  ImportRunReport,
  ImportRunErrorSummary,
  RepositoryConfig,
} from './source-validation';

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
