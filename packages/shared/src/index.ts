// ============================================================
// 漫画聚合阅读网站 — 共享类型定义
// ============================================================

// ---------- 书源适配器接口 ----------
export interface ComicInfo {
  comicId: string;
  title: string;
  author: string;
  cover: string;
  status: ComicStatus;
  description: string;
  lastChapter: string;
  updatedAt: string;
  source: string;
  tags?: string[];
}

export type ComicStatus = 'ongoing' | 'completed' | 'hiatus';

export interface ChapterInfo {
  chapterId: string;
  title: string;
  url: string;
  index: number;
}

export interface ChapterDetail {
  chapterId: string;
  comicTitle: string;
  chapterTitle: string;
  images: string[];
  prevChapter?: { chapterId: string; title: string };
  nextChapter?: { chapterId: string; title: string };
}

export interface SearchResult {
  source: string;
  results: ComicInfo[];
}

// ---------- 书源适配器接口 ----------
export interface ISourceAdapter {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;

  search(query: string): Promise<ComicInfo[]>;
  getComicDetail(comicId: string): Promise<ComicInfo>;
  getChapters(comicId: string): Promise<ChapterInfo[]>;
  getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail>;
}

// ---------- 本地存储数据结构 ----------
export interface FavoriteComic {
  id: string;
  comicId: string;
  title: string;
  author?: string;
  cover?: string;
  source: string;
  lastChapter?: string;
  addedAt: number;
}

export interface ReadingProgress {
  id: string;
  comicId: string;
  comicTitle: string;
  source: string;
  chapterId: string;
  chapterTitle: string;
  chapterUrl: string;
  pageIndex: number;
  cover?: string;
  lastReadAt: number;
}

export interface BrowseHistory {
  id: string;
  comicId: string;
  title: string;
  source: string;
  comicUrl: string;
  cover?: string;
  chapterTitle: string;
  chapterUrl: string;
  pageIndex: number;
  lastReadAt: number;
}

// ---------- 书源管理 ----------
export interface SourceStatus {
  id: string;
  name: string;
  enabled: boolean;
  searchTest?: SourceTestResult;
  detailTest?: SourceTestResult;
  chapterTest?: SourceTestResult;
}

export interface SourceTestResult {
  success: boolean;
  responseTime: number;
  error?: string;
}

// ---------- 书源策略与模式 ----------
export type SourceMode = 'server-parser' | 'client-parser' | 'external-only';

export type SourceHealthStatus = 'healthy' | 'degraded' | 'blocked' | 'disabled' | 'unknown';

export interface SourcePolicyInfo {
  mode: SourceMode;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  cooldownAfterBlockedMs: number;
  maxImagesPerBatch: number;
}

export interface SourceHealthInfo {
  sourceId: string;
  status: SourceHealthStatus;
  consecutiveFailures: number;
  blockedUntil?: string;
  lastError?: string;
  lastCheckedAt?: string;
}

export interface SourceFullInfo {
  id: string;
  name: string;
  tier: string;
  enabled: boolean;
  domain: string;
  domainCount: number;
  mode: SourceMode;
  healthStatus: SourceHealthStatus;
  blockedUntil?: string;
  lastError?: string;
  requestConfig: Record<string, unknown>;
  policyConfig: SourcePolicyInfo;
}
