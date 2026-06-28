// ============================================================
// packages/types/src/source.ts
// MangaSource — current active schema (flat-string selectors)
// V3 upgrade (SelectorExpression) in source-v3.ts
// ============================================================

export type SourceMode = 'server-parser' | 'client-parser' | 'external-only';

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
  cooldownAfterBlockedMs: 86_400_000,
  maxImagesPerBatch: 6,
};

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

export interface MangaSource {
  id: string; name: string; host: string; enabled: boolean;
  language: string; weight: number; tags: string[];
  mode?: 'server' | 'client';
  search: SourceSearchRule;
  detail: SourceDetailRule;
  chapters: SourceChapterRule;
  images: SourceImageRule;
  headers?: Record<string, string>;
  timeoutMs?: number;
  createdAt: string; updatedAt: string;
}
