// ============================================================
// 前端类型定义
// ============================================================

export interface ComicInfo {
  comicId: string;
  title: string;
  author: string;
  cover: string;
  status: 'ongoing' | 'completed' | 'hiatus';
  description: string;
  lastChapter: string;
  updatedAt: string;
  source: string;
  sourceName?: string;
  tags?: string[];
}

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
  cover?: string;
  author?: string;
  prevChapter?: { chapterId: string; title: string };
  nextChapter?: { chapterId: string; title: string };
}

export interface SourceSearchResult {
  source: string;
  sourceName: string;
  results: ComicInfo[];
  error?: string;
}

export interface SearchResponse {
  query: string;
  sources: SourceSearchResult[];
}

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

export interface SourceStatus {
  id: string;
  name: string;
  tier?: string;
  domain: string;
  enabled: boolean;
  domainCount?: number;
  requestConfig?: { timeout: number; userAgent: string; retries: number };
}

// ========== 书源管理系统类型 ==========

export interface SourceConfigFull {
  sourceId: string;
  name: string;
  tier: 'core' | 'supplement' | 'disabled';
  enabled: boolean;
  requestConfig: { timeout: number; userAgent: string; retries: number };
  domains: DomainEntry[];
}

export interface DomainEntry {
  id: number;
  url: string;
  priority: number;
  isActive: boolean;
  failCount: number;
  successCount: number;
  note?: string;
}

export interface HealthReport {
  sourceId: string;
  name: string;
  tier: string;
  domain: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy' | 'disabled' | 'unknown';
  checks: HealthCheck[];
  lastCheckAt: string;
}

export interface HealthCheck {
  checkType: string;
  isHealthy: boolean;
  statusCode?: number;
  responseTimeMs: number;
  errorType?: string;
  errorMessage?: string;
  lastCheckAt?: string;
}

export interface CheckLogEntry {
  id: number;
  source_id: string;
  source_name: string;
  domain: string;
  check_type: string;
  is_healthy: number;
  status_code: number | null;
  response_time_ms: number;
  error_type: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SearchLogEntry {
  id: number;
  source_id: string;
  keyword: string;
  is_success: number;
  result_count: number;
  response_time_ms: number;
  error_message: string | null;
  created_at: string;
}
