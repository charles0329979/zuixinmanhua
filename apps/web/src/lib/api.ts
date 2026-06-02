// ============================================================
// API 客户端 — 与 NestJS 后端通信
// ============================================================
import type { SearchResponse, ComicInfo, ChapterInfo, ChapterDetail, SourceStatus } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---------- 搜索 ----------
export async function searchAll(query: string): Promise<SearchResponse> {
  return fetchJSON<SearchResponse>(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
}

export async function searchSource(source: string, query: string): Promise<SearchResponse> {
  return fetchJSON<SearchResponse>(`${API_BASE}/search/${source}?q=${encodeURIComponent(query)}`);
}

// ---------- 漫画详情 ----------
export async function getComicDetail(source: string, comicId: string): Promise<ComicInfo> {
  return fetchJSON<ComicInfo>(`${API_BASE}/comic/${source}/${comicId}`);
}

// ---------- 章节列表 ----------
export async function getChapters(source: string, comicId: string): Promise<ChapterInfo[]> {
  return fetchJSON<ChapterInfo[]>(`${API_BASE}/comic/${source}/${comicId}/chapters`);
}

// ---------- 章节图片 ----------
export async function getChapterImages(source: string, comicId: string, chapterId: string): Promise<ChapterDetail> {
  return fetchJSON<ChapterDetail>(`${API_BASE}/chapter/${source}/${comicId}/${chapterId}`);
}

// ---------- 书源管理 ----------
export async function getSources(): Promise<SourceStatus[]> {
  return fetchJSON<SourceStatus[]>(`${API_BASE}/sources`);
}

export async function toggleSource(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  return fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function testSourceSearch(id: string): Promise<Record<string, unknown>> {
  return fetchJSON(`${API_BASE}/sources/${id}/test-search`, { method: 'POST' });
}

export async function testSourceDetail(id: string, comicId: string): Promise<Record<string, unknown>> {
  return fetchJSON(`${API_BASE}/sources/${id}/test-detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicId }),
  });
}

export async function testSourceChapter(id: string, comicId: string): Promise<Record<string, unknown>> {
  return fetchJSON(`${API_BASE}/sources/${id}/test-chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicId }),
  });
}

// ========== 新增：书源管理 API ==========
import type { SourceConfigFull, DomainEntry, HealthReport, CheckLogEntry, SearchLogEntry } from '@/types';

export async function getSourceConfig(id: string): Promise<SourceConfigFull> {
  return fetchJSON(`${API_BASE}/sources/${id}/config`);
}

export async function setSourceTier(id: string, tier: string): Promise<{ ok: boolean }> {
  return fetchJSON(`${API_BASE}/sources/${id}/tier`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
}

export async function addSourceDomain(id: string, url: string): Promise<DomainEntry> {
  return fetchJSON(`${API_BASE}/sources/${id}/domains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export async function removeSourceDomain(id: string, domainId: number): Promise<{ ok: boolean }> {
  return fetchJSON(`${API_BASE}/sources/${id}/domains/${domainId}`, { method: 'DELETE' });
}

// ========== 健康检测 API ==========
export async function getAllHealth(): Promise<HealthReport[]> {
  return fetchJSON(`${API_BASE}/health`);
}

export async function getSourceHealth(sourceId: string): Promise<HealthReport> {
  return fetchJSON(`${API_BASE}/health/${sourceId}`);
}

export async function triggerHealthCheck(sourceId: string): Promise<HealthReport> {
  return fetchJSON(`${API_BASE}/health/${sourceId}/check`, { method: 'POST' });
}

// ========== 日志 API ==========
export async function getCheckLogs(source?: string, limit = 50): Promise<CheckLogEntry[]> {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  params.set('limit', String(limit));
  return fetchJSON(`${API_BASE}/logs/checks?${params}`);
}

export async function getSearchLogs(limit = 50): Promise<SearchLogEntry[]> {
  return fetchJSON(`${API_BASE}/logs/searches?limit=${limit}`);
}

// ========== 图片代理 URL ==========
export function getProxyImageUrl(rawUrl: string, sourceId: string): string {
  return `${API_BASE}/proxy/image?url=${encodeURIComponent(rawUrl)}&source=${sourceId}`;
}
