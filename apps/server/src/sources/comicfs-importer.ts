// ============================================================
// apps/server/src/sources/comicfs-importer.ts
// 将 public/comicfs-data/sources/*.json 转换为 MangaSource 格式
// comicfs 格式: { search: { item, title: "key##regex##replacement###" } }
// MangaSource 格式: { search: { responseType: "json", listSelector, ... } }
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { MangaSource } from './source-store';

interface ComicfsSourceRaw {
  id: string;
  name: string;
  host: string;
  language?: string;
  weight?: number;
  enabledByDefault?: boolean;
  mode?: string;
  version?: string;
  riskLevel?: string;
  search: Record<string, string>;
  detail: Record<string, string>;
  chapters: Record<string, string>;
  images: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * Parse comicfs selector format: "fieldName##regex##replacement###"
 * Returns: { jsonField, regex, replacement }
 */
function parseComicfsSelector(raw: string): { jsonField: string; regex: RegExp | null; replacement: string | null } | null {
  if (!raw) return null;
  // Format: "key##pattern##replacement###"
  const parts = raw.split('##');
  if (parts.length === 0) return null;

  const jsonField = parts[0]?.trim() || '';
  let regex: RegExp | null = null;
  let replacement: string | null = null;

  if (parts.length >= 2 && parts[1]) {
    try {
      regex = new RegExp(parts[1], 'g');
    } catch {
      regex = null;
    }
  }
  if (parts.length >= 3 && parts[2] !== undefined) {
    replacement = parts[2] || '';
  }

  return { jsonField, regex, replacement };
}

function normalizeHost(host: string): string {
  if (!host) return '';
  let h = host.trim();
  if (!h.startsWith('http://') && !h.startsWith('https://')) {
    h = 'https://' + h;
  }
  return h.replace(/\/$/, '');
}

/** Convert comicfs JSON source to MangaSource format */
function convertOne(raw: ComicfsSourceRaw): MangaSource | null {
  if (!raw.id || !raw.name || !raw.host) return null;

  const host = normalizeHost(raw.host);
  const now = new Date().toISOString();

  // Determine selector type: if search.title contains '##', it's JSON+regex, otherwise HTML CSS
  const isJsonSearch = raw.search.title?.includes('##') || raw.search.item?.includes('data');

  return {
    id: raw.id,
    name: raw.name,
    host,
    enabled: raw.enabledByDefault ?? true,
    language: raw.language || 'zh',
    weight: raw.weight || 0,
    tags: [raw.riskLevel || 'unknown'],
    mode: (raw.mode === 'server-parser' ? 'server' : 'server') as 'server' | 'client',
    search: {
      url: raw.search.path || raw.search.url || '/search?keyword={{keyword}}',
      method: 'GET',
      responseType: isJsonSearch ? 'json' : 'html',
      keywordParam: 'keyword',
      listSelector: raw.search.item || raw.search.listSelector || 'data',
      titleSelector: raw.search.title || '',
      coverSelector: raw.search.cover || '',
      detailUrlSelector: raw.search.url || '',
      latestChapterSelector: raw.search.latest || raw.search.latestChapter || '',
      statusSelector: raw.search.status || '',
      updateTimeSelector: raw.search.updateTime || '',
    },
    detail: {
      titleSelector: raw.detail.title || '',
      coverSelector: raw.detail.cover || '',
      authorSelector: raw.detail.author || '',
      descriptionSelector: raw.detail.description || raw.detail.intro || '',
      statusSelector: raw.detail.status || '',
      latestChapterSelector: raw.detail.latest || raw.detail.lastChapter || '',
    },
    chapters: {
      listSelector: raw.chapters.item || raw.chapters.list || 'data',
      titleSelector: raw.chapters.title || '',
      urlSelector: raw.chapters.url || '',
    },
    images: {
      listSelector: raw.images.item || raw.images.list || 'data',
      srcAttribute: raw.images.src || raw.images.url || 'src',
    },
    headers: raw.headers,
    timeoutMs: 8000,
    createdAt: now,
    updatedAt: now,
    // Preserve original comicfs data for selector resolution
    _comicfsSelectors: isJsonSearch ? {
      searchTitle: raw.search.title,
      searchUrl: raw.search.url,
      searchCover: raw.search.cover,
      detailTitle: raw.detail.title,
      detailCover: raw.detail.cover,
      detailAuthor: raw.detail.author,
      detailDesc: raw.detail.description || raw.detail.intro,
      chapterTitle: raw.chapters.title,
      chapterUrl: raw.chapters.url,
      imageSrc: raw.images.src || raw.images.url,
    } : undefined,
  } as MangaSource & { _comicfsSelectors?: Record<string, string> };
}

/**
 * Import all comicfs sources from directory
 */
export function importComicfsDir(dirPath: string): MangaSource[] {
  const sources: MangaSource[] = [];
  if (!fs.existsSync(dirPath)) return sources;

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8')) as ComicfsSourceRaw;
      const converted = convertOne(raw);
      if (converted) sources.push(converted);
    } catch {
      // skip corrupted files
    }
  }
  return sources;
}

/**
 * Read index.json to get enabled/weight metadata
 */
export function readComicfsIndex(indexPath: string): Record<string, { enabled: boolean; weight: number }> {
  const meta: Record<string, { enabled: boolean; weight: number }> = {};
  try {
    if (!fs.existsSync(indexPath)) return meta;
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entries = index.sources || index.entries || [];
    for (const entry of entries) {
      if (entry.id) {
        meta[entry.id] = {
          enabled: entry.enabled !== false,
          weight: entry.weight || 0,
        };
      }
    }
  } catch { /* ignore */ }
  return meta;
}
