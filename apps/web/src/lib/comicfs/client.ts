// ============================================================
// comicfs HTTP 客户端 — 从 comicfs 仓库拉取数据
// 优先级：本地文件 > raw.githubusercontent.com > GitHub Pages
// ============================================================
import {
  ComicfsManifest,
  ComicfsIndex,
  ComicfsAdConfig,
  ComicfsSourceHealth,
  ComicfsSource,
  ComicfsNetworkError,
  ComicfsParseError,
} from './types';

// ---- 数据源配置 (按优先级排序) ----
// 1. 本地 Next.js 静态资源 (浏览器端 fetch /comicfs-data/...)
const COMICFS_LOCAL_BASE = '/comicfs-data';

// 2. 本地文件系统路径 (服务端直接读文件)
const COMICFS_LOCAL_FS = (() => {
  if (typeof window === 'undefined') {
    // Next.js API routes 运行在 apps/web 目录
    return 'public/comicfs-data';
  }
  return '';
})();

// 3. GitHub raw (远程后备)
const COMICFS_RAW_BASE =
  'https://raw.githubusercontent.com/charles0329979/comicfs/master/data/public';

// 4. GitHub Pages (第二远程后备，需在 comicfs 仓库启用 Pages)
const COMICFS_PAGES_BASE = 'https://charles0329979.github.io/comicfs';

// ---- 请求配置 ----
const DEFAULT_TIMEOUT_MS = 15000;

// ==================== 服务端：直接读文件系统 ====================

async function readLocalFile<T>(relPath: string): Promise<T | null> {
  try {
    if (typeof window !== 'undefined') return null; // 浏览器端不能用fs
    const fs = await import('fs');
    const path = await import('path');
    const fullPath = path.resolve(process.cwd(), COMICFS_LOCAL_FS, relPath);
    if (!fs.existsSync(fullPath)) return null;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ==================== 浏览器端：fetch 本地静态资源 ====================

async function fetchLocalJSON<T>(relPath: string, timeoutMs?: number): Promise<T | null> {
  try {
    if (typeof window === 'undefined') return null; // 服务端不用fetch
    const url = `${COMICFS_LOCAL_BASE}/${relPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

// ==================== 远程请求 ====================

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ComicfsNetworkError(
        `Request timeout after ${timeoutMs}ms: ${url}`,
        undefined,
        url,
      );
    }
    throw new ComicfsNetworkError(
      `Network error fetching ${url}: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      url,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemoteJSON<T>(url: string, timeoutMs?: number): Promise<T> {
  const response = await fetchWithTimeout(url, timeoutMs);

  if (!response.ok) {
    throw new ComicfsNetworkError(
      `HTTP ${response.status}: ${response.statusText} for ${url}`,
      response.status,
      url,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ComicfsParseError(
      `Failed to parse JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 多级数据源尝试：本地 → raw → pages
 * 每级都会尝试，任一级成功即返回
 */
async function fetchFromSources<T>(
  relPath: string,
  timeoutMs?: number,
): Promise<T> {
  const errors: string[] = [];

  // Level 1: 服务端本地文件系统
  const localFS = await readLocalFile<T>(relPath);
  if (localFS !== null) return localFS;

  // Level 2: 浏览器端本地静态资源
  const localFetch = await fetchLocalJSON<T>(relPath, timeoutMs);
  if (localFetch !== null) return localFetch;

  // Level 3: GitHub raw
  try {
    return await fetchRemoteJSON<T>(`${COMICFS_RAW_BASE}/${relPath}`, timeoutMs);
  } catch (e) {
    errors.push(`raw: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Level 4: GitHub Pages
  try {
    return await fetchRemoteJSON<T>(`${COMICFS_PAGES_BASE}/${relPath}`, timeoutMs);
  } catch (e) {
    errors.push(`pages: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new ComicfsNetworkError(
    `All data sources failed for ${relPath}: ${errors.join('; ')}`,
    undefined,
    relPath,
  );
}

// ---- 公开 API ----

/** 获取仓库清单 manifest.json */
export async function fetchManifest(): Promise<ComicfsManifest> {
  return fetchFromSources<ComicfsManifest>('manifest.json');
}

/** 获取书源索引 index.json（81个源的摘要） */
export async function fetchIndex(): Promise<ComicfsIndex> {
  return fetchFromSources<ComicfsIndex>('index.json');
}

/** 获取广告配置 ad-config.json */
export async function fetchAdConfig(): Promise<ComicfsAdConfig> {
  try {
    return await fetchFromSources<ComicfsAdConfig>('ad-config.json');
  } catch {
    return { enabled: false, configUrl: '' };
  }
}

/** 获取源健康状态 source-health.json */
export async function fetchSourceHealth(): Promise<ComicfsSourceHealth> {
  return fetchFromSources<ComicfsSourceHealth>('source-health.json');
}

/** 获取单个源完整规则 sources/{id}.json */
export async function fetchSourceById(id: string): Promise<ComicfsSource> {
  return fetchFromSources<ComicfsSource>(`sources/${id}.json`);
}
