// ============================================================
// API 客户端 — 与 NestJS 后端通信
// ============================================================
import type {
  SearchResponse, ComicInfo, ChapterInfo, ChapterDetail,
  SourceStatus, SourceConfigFull, DomainEntry,
  HealthReport, CheckLogEntry, SearchLogEntry,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    // Try to extract error message from JSON response body
    let message = `API Error: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.message) message = body.message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

// ============================================================
// 统一导出的 API 对象
// ============================================================
export const api = {
  // ---------- 搜索 ----------
  searchAll: (query: string) =>
    fetchJSON<SearchResponse>(`${API_BASE}/search?q=${encodeURIComponent(query)}`),

  searchSource: (source: string, query: string) =>
    fetchJSON<SearchResponse>(`${API_BASE}/search/${source}?q=${encodeURIComponent(query)}`),

  // ---------- 漫画详情 ----------
  getComicDetail: (source: string, comicId: string) =>
    fetchJSON<ComicInfo>(`${API_BASE}/comic/${source}/${comicId}`),

  // ---------- 章节 ----------
  getChapters: (source: string, comicId: string) =>
    fetchJSON<ChapterInfo[]>(`${API_BASE}/comic/${source}/${comicId}/chapters`),

  getChapterImages: (source: string, comicId: string, chapterId: string) =>
    fetchJSON<ChapterDetail>(`${API_BASE}/chapter/${source}/${comicId}/${chapterId}`),

  // ---------- 书源管理 ----------
  getSources: () =>
    fetchJSON<SourceStatus[]>(`${API_BASE}/sources`),

  getSourceConfig: (id: string) =>
    fetchJSON<SourceConfigFull>(`${API_BASE}/sources/${id}/config`),

  toggleSource: (id: string, enabled: boolean) =>
    fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),

  setSourceTier: (id: string, tier: string) =>
    fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/tier`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    }),

  setSourceMode: (id: string, mode: string) =>
    fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/mode`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }),

  setSourcePolicy: (id: string, policy: Record<string, unknown>) =>
    fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policy),
    }),

  recoverSource: (id: string) =>
    fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/recover`, { method: 'POST' }),

  getCircuitBreakerStatus: (id: string) =>
    fetchJSON<{
      sourceId: string; status: string; consecutiveFailures: number;
      blockedUntil?: string; lastError?: string; lastCheckedAt?: string;
    }>(`${API_BASE}/sources/${id}/health`),

  // ---------- 域名管理 ----------
  addSourceDomain: (id: string, url: string) =>
    fetchJSON<DomainEntry>(`${API_BASE}/sources/${id}/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),

  removeSourceDomain: (id: string, domainId: number) =>
    fetchJSON<{ ok: boolean }>(`${API_BASE}/sources/${id}/domains/${domainId}`, { method: 'DELETE' }),

  // ---------- 测试 ----------
  testSourceSearch: (id: string) =>
    fetchJSON<Record<string, unknown>>(`${API_BASE}/sources/${id}/test-search`, { method: 'POST' }),

  testSourceDetail: (id: string, comicId: string) =>
    fetchJSON<Record<string, unknown>>(`${API_BASE}/sources/${id}/test-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comicId }),
    }),

  testSourceChapter: (id: string, comicId: string) =>
    fetchJSON<Record<string, unknown>>(`${API_BASE}/sources/${id}/test-chapter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comicId }),
    }),

  // ---------- 健康检测 ----------
  getAllHealth: () =>
    fetchJSON<HealthReport[]>(`${API_BASE}/health`),

  getSourceHealth: (sourceId: string) =>
    fetchJSON<HealthReport>(`${API_BASE}/health/${sourceId}`),

  triggerHealthCheck: (sourceId: string) =>
    fetchJSON<HealthReport>(`${API_BASE}/health/${sourceId}/check`, { method: 'POST' }),

  // ---------- 日志 ----------
  getCheckLogs: (source?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    params.set('limit', String(limit));
    return fetchJSON<CheckLogEntry[]>(`${API_BASE}/logs/checks?${params}`);
  },

  getSearchLogs: (limit = 50) =>
    fetchJSON<SearchLogEntry[]>(`${API_BASE}/logs/searches?limit=${limit}`),

  // ---------- 图片代理 ----------
  getProxyImageUrl: (rawUrl: string, sourceId: string) =>
    `${API_BASE}/proxy/image?url=${encodeURIComponent(rawUrl)}&source=${sourceId}`,
};

// ============================================================
// 向后兼容：保留独立导出（解构导入）
// ============================================================
export const {
  searchAll,
  searchSource,
  getComicDetail,
  getChapters,
  getChapterImages,
  getSources,
  getSourceConfig,
  toggleSource,
  setSourceTier,
  setSourceMode,
  setSourcePolicy,
  recoverSource,
  getCircuitBreakerStatus,
  addSourceDomain,
  removeSourceDomain,
  testSourceSearch,
  testSourceDetail,
  testSourceChapter,
  getAllHealth,
  getSourceHealth,
  triggerHealthCheck,
  getCheckLogs,
  getSearchLogs,
  getProxyImageUrl,
} = api;
