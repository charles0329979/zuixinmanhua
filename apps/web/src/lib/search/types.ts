// ============================================================
// 统一搜索类型定义
// ============================================================

/** 单条搜索结果 */
export interface UnifiedSearchResult {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  cover?: string;
  author?: string;
  latestChapter?: string;
  status?: string;
  detailUrl: string;
  updateTime?: string;
  weight?: number;
}

/** 单源错误 */
export interface UnifiedSearchError {
  sourceId: string;
  sourceName: string;
  reason: string;
  scope: 'source' | 'search-api' | 'source-loader';
}

/** Dry-run 源信息 */
export interface DryRunSource {
  sourceId: string;
  sourceName: string;
  host: string;
  searchPath: string;
  finalSearchUrl: string;
  riskLevel: string;
}

/** 统一搜索响应 */
export interface UnifiedSearchResponse {
  ok: boolean;
  keyword: string;
  dryRun: boolean;
  sourceCount: number;
  successSourceCount: number;
  failedSourceCount: number;
  durationMs: number;
  results: UnifiedSearchResult[];
  errors: UnifiedSearchError[];
  sources?: DryRunSource[]; // dryRun 模式时填充
}

/** 搜索选项 */
export interface UnifiedSearchOptions {
  keyword: string;
  maxSources?: number;
  concurrency?: number;
  sourceTimeoutMs?: number;
  dryRun?: boolean;
}

// 常量
export const DEFAULT_MAX_SOURCES = 10;
export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_SOURCE_TIMEOUT_MS = 8000;
