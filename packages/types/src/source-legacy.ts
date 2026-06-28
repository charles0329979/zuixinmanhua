// ============================================================
// packages/types/src/source-legacy.ts
// Legacy flat-string MangaSource format (V1/V2 compat)
// Used by: apps/server/src/sources/source-store.ts
// Migrating to: packages/types/src/source.ts (V3 SelectorExpression)
// ============================================================

export interface SourceSearchRule {
  url: string;
  method?: 'GET' | 'POST';
  keywordParam?: string;
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
  id: string;
  name: string;
  host: string;
  enabled: boolean;
  language: string;
  weight: number;
  tags: string[];
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
