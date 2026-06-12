// ============================================================
// manga-search 类型定义 — 聚合搜索 v1
// ============================================================

/** 单条漫画搜索结果 */
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
  weight?: number;
}

/** 单个源的搜索错误 */
export interface SearchSourceError {
  sourceId: string;
  sourceName: string;
  reason: string;
  scope?: string; // 'source' | 'search-api' | 'source-loader'
}

/** 统一搜索响应 */
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
  dryRun?: boolean;
  dryRunSources?: Array<Record<string, unknown>>;
}

/** 搜索选项 */
export interface SearchOptions {
  keyword: string;
  maxSources?: number; // 默认 10
  sourceTimeoutMs?: number; // 每个源超时，默认 8000
  totalTimeoutMs?: number; // 总超时，默认 15000
  concurrency?: number; // 并发数，默认 3
  dedupe?: boolean; // 是否去重，默认 true
  dryRun?: boolean; // dry-run 模式，不请求漫画站
}

// 从 comicfs 模块重新导出需要的类型，避免循环依赖
export type { ComicfsSource, ComicfsSourceSummary } from '@/lib/comicfs/types';

/** 源规则中的搜索配置（简化，只取搜索需要的字段） */
export interface SourceSearchRule {
  path: string; // URL 模板，如 "https://cn.baozimh.com/search?q={{keyword}}"
  item: string; // 列表项选择器
  title: string; // 标题选择器
  url: string; // 详情URL选择器
  cover: string; // 封面选择器
  latest: string; // 最新章节选择器
  status: string; // 状态选择器
  updateTime: string; // 更新时间选择器
}
