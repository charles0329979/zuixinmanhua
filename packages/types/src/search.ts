// ============================================================
// packages/types/src/search.ts
// 搜索相关类型 — 聚合搜索请求/响应
// ============================================================

/** 聚合搜索中的单条漫画结果 */
export interface AggregatedComicResult {
  title: string;
  cover: string;
  detailUrl: string;
  sourceId: string;
  sourceName: string;
  latestChapter?: string;
  status?: string;
  updateTime?: string;
  author?: string;
}

/** 单源搜索错误 */
export interface SearchSourceError {
  sourceId: string;
  sourceName: string;
  reason: string;
  scope: string;
}

/** 聚合搜索请求参数 */
export interface SearchOptions {
  keyword: string;
  maxSources?: number;
  sourceTimeoutMs?: number;
  concurrency?: number;
  dedupe?: boolean;
  /** 只返回源信息，不实际搜索 */
  dryRun?: boolean;
}

/** 聚合搜索完整响应 */
export interface AggregatedSearchResponse {
  keyword: string;
  totalResults: number;
  sources: AggregatedSourceResult[];
}

export interface AggregatedSourceResult {
  sourceId: string;
  sourceName: string;
  results: AggregatedComicResult[];
  error?: string;
}

/** 统一搜索结果 (内部去重后) */
export interface MangaSearchResult {
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
  weight: number;
}

/** 搜索响应 (聚合搜索服务返回) */
export interface SearchResponse {
  ok: boolean;
  keyword: string;
  total: number;
  durationMs: number;
  sourceCount: number;
  successSourceCount: number;
  failedSourceCount: number;
  results: MangaSearchResult[];
  errors: SearchSourceError[];
}
