// ============================================================
// packages/source-core/src/comicfs/client.ts
// comicfs HTTP 客户端 — 从 GitHub/本地拉取源注册表数据
// 优先级: 本地文件 > raw.githubusercontent.com > GitHub Pages
// ============================================================

import type {
  ComicfsManifest, ComicfsIndex, ComicfsAdConfig,
  ComicfsSourceHealth, ComicfsSource,
} from '@zuixinmanhua/types';
import { ComicfsNetworkError, ComicfsParseError } from '@zuixinmanhua/types';

const COMICFS_RAW_BASE =
  'https://raw.githubusercontent.com/charles0329979/comicfs/master/data/public';
const COMICFS_PAGES_BASE = 'https://charles0329979.github.io/comicfs';
const DEFAULT_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ComicfsNetworkError(`Timeout: ${url}`, undefined, url);
    }
    throw new ComicfsNetworkError(`Network error: ${error.message}`, undefined, url);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemoteJSON<T>(url: string, timeoutMs?: number): Promise<T> {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    throw new ComicfsNetworkError(`HTTP ${response.status}: ${url}`, response.status, url);
  }
  try {
    return (await response.json()) as T;
  } catch (error: any) {
    throw new ComicfsParseError(`JSON parse failed: ${error.message}`);
  }
}

async function fetchFromSources<T>(relPath: string, timeoutMs?: number): Promise<T> {
  const errors: string[] = [];

  // Level 1: GitHub raw
  try {
    return await fetchRemoteJSON<T>(`${COMICFS_RAW_BASE}/${relPath}`, timeoutMs);
  } catch (e: any) {
    errors.push(`raw: ${e.message}`);
  }

  // Level 2: GitHub Pages
  try {
    return await fetchRemoteJSON<T>(`${COMICFS_PAGES_BASE}/${relPath}`, timeoutMs);
  } catch (e: any) {
    errors.push(`pages: ${e.message}`);
  }

  throw new ComicfsNetworkError(`All sources failed for ${relPath}: ${errors.join('; ')}`);
}

/** 获取清单 manifest.json */
export async function fetchManifest(): Promise<ComicfsManifest> {
  return fetchFromSources<ComicfsManifest>('manifest.json');
}

/** 获取书源索引 */
export async function fetchIndex(): Promise<ComicfsIndex> {
  return fetchFromSources<ComicfsIndex>('index.json');
}

/** 获取广告配置 */
export async function fetchAdConfig(): Promise<ComicfsAdConfig> {
  try {
    return await fetchFromSources<ComicfsAdConfig>('ad-config.json');
  } catch {
    return { enabled: false, configUrl: '' };
  }
}

/** 获取源健康状态 */
export async function fetchSourceHealth(): Promise<ComicfsSourceHealth> {
  return fetchFromSources<ComicfsSourceHealth>('source-health.json');
}

/** 获取单个源完整规则 */
export async function fetchSourceById(id: string): Promise<ComicfsSource | null> {
  try {
    return await fetchFromSources<ComicfsSource>(`sources/${id}.json`);
  } catch (e: any) {
    // High-risk/blocked sources are expected to 404
    if (e instanceof ComicfsNetworkError && e.statusCode === 404) {
      return null;
    }
    throw e;
  }
}
