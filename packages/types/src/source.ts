// ============================================================
// packages/types/src/source.ts
// 规则化书源定义 (Legado/阅读3.0 格式) + 策略配置
// ============================================================

// ---- 运行模式 ----

export type SourceMode = 'server-parser' | 'client-parser' | 'external-only';

// ---- 策略配置 ----

export interface SourcePolicy {
  mode: SourceMode;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  cooldownAfterBlockedMs: number;
  maxImagesPerBatch: number;
}

export const DEFAULT_SOURCE_POLICY: SourcePolicy = {
  mode: 'server-parser',
  maxConcurrentRequests: 1,
  requestTimeoutMs: 5000,
  cooldownAfterBlockedMs: 86_400_000, // 24h
  maxImagesPerBatch: 6,
};

// ---- 规则化书源定义 (Legado/CMS 格式) ----

export interface SourceSearchRule {
  url: string;
  method?: 'GET' | 'POST';
  responseType?: 'html' | 'json';
  listSelector: string;
  titleSelector: string;
  coverSelector: string;
  detailUrlSelector: string;
  latestChapterSelector?: string;
  statusSelector?: string;
  updateTimeSelector?: string;
}

export interface SourceDetailRule {
  titleSelector: string;
  coverSelector?: string;
  authorSelector?: string;
  descriptionSelector?: string;
  statusSelector?: string;
  latestChapterSelector?: string;
}

export interface SourceChapterRule {
  listSelector: string;
  titleSelector: string;
  urlSelector: string;
}

export interface SourceImageRule {
  listSelector: string;
  srcAttribute: string;
}

/** 完整的规则化书源定义 */
export interface MangaSource {
  id: string;
  name: string;
  host: string;
  enabled: boolean;
  language: string;
  weight: number;
  tags: string[];
  /** 'server' = 服务端抓取, 'client' = 客户端抓取后提交服务端解析 */
  mode?: 'server' | 'client';
  search: SourceSearchRule;
  detail: SourceDetailRule;
  chapters: SourceChapterRule;
  images: SourceImageRule;
  headers?: Record<string, string>;
  timeoutMs?: number;
  createdAt: string;
  updatedAt: string;
}
