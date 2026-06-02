// ============================================================
// API 客户端 — 与 NestJS 后端通信
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---------- 搜索 ----------
export async function searchAll(query: string) {
  const { default: s } = await import('@/types');
  type R = import('@/types').SearchResponse;
  return fetchJSON<R>(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
}

export async function searchSource(source: string, query: string) {
  return fetchJSON(`${API_BASE}/search/${source}?q=${encodeURIComponent(query)}`);
}

// ---------- 漫画详情 ----------
export async function getComicDetail(source: string, comicId: string) {
  return fetchJSON(`${API_BASE}/comic/${source}/${comicId}`);
}

// ---------- 章节列表 ----------
export async function getChapters(source: string, comicId: string) {
  return fetchJSON(`${API_BASE}/comic/${source}/${comicId}/chapters`);
}

// ---------- 章节图片 ----------
export async function getChapterImages(source: string, comicId: string, chapterId: string) {
  return fetchJSON(`${API_BASE}/chapter/${source}/${comicId}/${chapterId}`);
}

// ---------- 书源管理 ----------
export async function getSources() {
  return fetchJSON(`${API_BASE}/sources`);
}

export async function toggleSource(id: string, enabled: boolean) {
  return fetchJSON(`${API_BASE}/sources/${id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function testSourceSearch(id: string) {
  return fetchJSON(`${API_BASE}/sources/${id}/test-search`, { method: 'POST' });
}

export async function testSourceDetail(id: string, comicId: string) {
  return fetchJSON(`${API_BASE}/sources/${id}/test-detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicId }),
  });
}

export async function testSourceChapter(id: string, comicId: string) {
  return fetchJSON(`${API_BASE}/sources/${id}/test-chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicId }),
  });
}
