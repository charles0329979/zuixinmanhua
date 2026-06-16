// ============================================================
// apps/mobile/src/api/client.ts
// ★ API Client — 可配置 server baseURL，支持多环境
// ============================================================

import { Platform } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';

// Default baseURL per platform
// Android emulator → host machine via 10.0.2.2
// iOS simulator → localhost
export function getDefaultBaseUrl(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api';
  }
  return 'http://localhost:3001/api';
}

/** Get the active API base URL (from settings if configured, otherwise default) */
export function getBaseUrl(): string {
  const configured = useSettingsStore.getState().serverUrl;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/$/, '');
  }
  return getDefaultBaseUrl();
}

// ---- Shared fetch helper ----

async function apiFetch<T = any>(
  path: string,
  opts?: RequestInit,
): Promise<T> {
  const base = getBaseUrl();
  const url = `${base}${path}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    ...opts,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ---- API Methods ----

export interface SearchParams {
  q: string;
  source?: string;
}

export interface SearchResultItem {
  comicId: string;
  title: string;
  author?: string;
  cover?: string;
  status?: string;
  description?: string;
  lastChapter?: string;
  source: string;
}

export interface AggregatedSourceResult {
  source: string;
  sourceName: string;
  tier?: string;
  healthStatus?: string;
  results: SearchResultItem[];
}

export interface SearchResponse {
  query: string;
  sources: AggregatedSourceResult[];
  summary: {
    totalResults: number;
    sourcesSearched: number;
    sourcesFailed: number;
    sourcesSkipped: number;
  };
}

export interface ComicDetail {
  comicId: string;
  title: string;
  author?: string;
  cover?: string;
  status?: string;
  description?: string;
  lastChapter?: string;
  source: string;
  tags?: string[];
}

export interface ChapterItem {
  chapterId: string;
  title: string;
  url?: string;
  index: number;
}

export interface ChapterDetail {
  chapterId: string;
  comicTitle?: string;
  chapterTitle?: string;
  images: string[];
  prevChapter?: { chapterId: string; title: string };
  nextChapter?: { chapterId: string; title: string };
}

// ---- API ----

/** Aggregated search across all enabled sources */
export async function search(q: string): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(
    `/search?q=${encodeURIComponent(q)}`,
  );
}

/** Single-source search */
export async function searchSource(
  source: string,
  q: string,
): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(
    `/search/${source}?q=${encodeURIComponent(q)}`,
  );
}

/** Get comic detail */
export async function getComicDetail(
  source: string,
  comicId: string,
): Promise<ComicDetail> {
  return apiFetch<ComicDetail>(`/comic/${source}/${encodeURIComponent(comicId)}`);
}

/** Get chapter list */
export async function getChapters(
  source: string,
  comicId: string,
): Promise<ChapterItem[]> {
  return apiFetch<ChapterItem[]>(
    `/comic/${source}/${encodeURIComponent(comicId)}/chapters`,
  );
}

/** Get chapter images */
export async function getChapterImages(
  source: string,
  comicId: string,
  chapterId: string,
): Promise<ChapterDetail> {
  return apiFetch<ChapterDetail>(
    `/chapter/${source}/${encodeURIComponent(comicId)}/${encodeURIComponent(chapterId)}`,
  );
}

/** Get proxied image URL (passes through server CDN/cache) */
export function getImageProxyUrl(originalUrl: string, source?: string): string {
  const base = getBaseUrl();
  const encoded = encodeURIComponent(originalUrl);
  let proxyUrl = `${base}/proxy/image?url=${encoded}`;
  if (source) {
    proxyUrl += `&source=${encodeURIComponent(source)}`;
  }
  return proxyUrl;
}

// ---- Health / Source APIs ----

export async function getSourceHealth(): Promise<any[]> {
  return apiFetch('/health');
}

export async function getSyncSources(): Promise<any> {
  return apiFetch('/sync/sources');
}
