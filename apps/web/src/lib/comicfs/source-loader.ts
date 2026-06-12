// ============================================================
// comicfs 源加载器 — 编排层
//   协调 manifest → index → sources 加载流程
//   过滤风险等级、合并健康状态、管理本地覆盖
// ============================================================
import {
  fetchManifest,
  fetchIndex,
  fetchSourceHealth,
  fetchSourceById,
} from './client';
import {
  getCached,
  getCachedOrStale,
  setCache,
  invalidateCache,
  invalidateAll,
  MANIFEST_TTL,
  INDEX_TTL,
  SOURCE_TTL,
  HEALTH_TTL,
} from './cache';
import type {
  ComicfsManifest,
  ComicfsIndex,
  ComicfsSourceSummary,
  ComicfsSource,
  ComicfsSourceHealth,
  LocalSourceOverride,
  RemoteSourceDisplay,
} from './types';

// ---- 缓存 key ----
const CK_MANIFEST = 'manifest';
const CK_INDEX = 'index';
const CK_HEALTH = 'source-health';
const CK_SOURCE_PREFIX = 'source:';

// ---- 本地覆盖存储 key ----
const OVERRIDES_KEY = 'comicfs:overrides';

// ==================== 过滤配置 ====================

export interface ActiveSourceFilter {
  riskLevels: string[]; // 默认 ['low', 'medium']
  statuses: string[]; // 默认 ['active']
  languages: string[] | null; // null = 不限
  search: string; // 文本搜索（name/host）
  onlyOk: boolean; // 只显示 health.ok = true 的源
}

const DEFAULT_FILTER: ActiveSourceFilter = {
  riskLevels: ['low', 'medium'],
  statuses: ['active'],
  languages: null,
  search: '',
  onlyOk: false,
};

// ==================== 本地覆盖 ====================

function getLocalOverrides(): Record<string, LocalSourceOverride> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalOverrides(overrides: Record<string, LocalSourceOverride>): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export function getLocalOverride(sourceId: string): LocalSourceOverride | null {
  const overrides = getLocalOverrides();
  return overrides[sourceId] ?? null;
}

export function setLocalEnabled(sourceId: string, enabled: boolean): void {
  const overrides = getLocalOverrides();
  overrides[sourceId] = {
    id: sourceId,
    locallyEnabled: enabled,
    locallyDisabled: !enabled,
  };
  saveLocalOverrides(overrides);
}

// ==================== 核心 API ====================

/**
 * 获取活跃源列表（经过过滤 + 合并健康状态 + 合并本地覆盖）
 *
 * 流程：
 *   1. 从缓存或远程拉取 index + health
 *   2. 按 riskLevel + status 过滤
 *   3. 合并 health.ok 状态
 *   4. 合并本地 enable/disable 覆盖
 *   5. 可选文本搜索过滤
 */
export async function getActiveSources(
  filter?: Partial<ActiveSourceFilter>,
): Promise<{
  sources: RemoteSourceDisplay[];
  manifest: ComicfsManifest | null;
  fromCache: boolean;
  error?: string;
}> {
  const f = { ...DEFAULT_FILTER, ...filter };

  let manifest: ComicfsManifest | null = null;
  let index: ComicfsIndex | null = null;
  let health: ComicfsSourceHealth | null = null;
  let fromCache = true;
  let error: string | undefined;

  // ---------- 1. 获取 manifest ----------
  const cachedManifest = getCachedOrStale<ComicfsManifest>(CK_MANIFEST);
  if (cachedManifest?.fresh) {
    manifest = cachedManifest.data;
  } else {
    try {
      manifest = await fetchManifest();
      setCache(CK_MANIFEST, manifest, MANIFEST_TTL);
      fromCache = false;
    } catch (err) {
      if (cachedManifest) {
        manifest = cachedManifest.data;
        error = 'Using stale manifest cache';
      } else {
        error = `Failed to load manifest: ${err instanceof Error ? err.message : String(err)}`;
        return { sources: [], manifest: null, fromCache, error };
      }
    }
  }

  // ---------- 2. 获取 index ----------
  const cachedIndex = getCachedOrStale<ComicfsIndex>(CK_INDEX);
  if (cachedIndex?.fresh && cachedIndex.data.version === manifest?.version) {
    index = cachedIndex.data;
  } else {
    try {
      index = await fetchIndex();
      setCache(CK_INDEX, index, INDEX_TTL);
      fromCache = false;
    } catch (err) {
      if (cachedIndex) {
        index = cachedIndex.data;
        error = error || 'Using stale index cache';
      } else {
        error = `Failed to load index: ${err instanceof Error ? err.message : String(err)}`;
        return { sources: [], manifest, fromCache, error };
      }
    }
  }

  // ---------- 3. 获取 health ----------
  const cachedHealth = getCachedOrStale<ComicfsSourceHealth>(CK_HEALTH);
  if (cachedHealth?.fresh) {
    health = cachedHealth.data;
  } else {
    try {
      health = await fetchSourceHealth();
      setCache(CK_HEALTH, health, HEALTH_TTL);
      fromCache = false;
    } catch {
      if (cachedHealth) {
        health = cachedHealth.data;
      }
      // health 失败不致命，继续处理
    }
  }

  // ---------- 4. 构建 health map ----------
  const healthMap = new Map<string, boolean>();
  const healthReasonMap = new Map<string, string>();
  const healthCheckedMap = new Map<string, string>();
  if (health?.items) {
    for (const item of health.items) {
      healthMap.set(item.id, item.ok);
      healthReasonMap.set(item.id, item.reason);
      healthCheckedMap.set(item.id, item.checkedAt);
    }
  }

  // ---------- 5. 过滤 + 合并 ----------
  const overrides = getLocalOverrides();
  const sources: RemoteSourceDisplay[] = [];

  for (const src of index.sources) {
    // 风险过滤
    if (!f.riskLevels.includes(src.riskLevel)) continue;

    // 状态过滤
    if (!f.statuses.includes(src.status)) continue;

    // 语言过滤
    if (f.languages && f.languages.length > 0 && !f.languages.includes(src.language)) continue;

    // health 过滤
    const ok = healthMap.has(src.id) ? healthMap.get(src.id)! : true;
    if (f.onlyOk && !ok) continue;

    // 文本搜索
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!src.name.toLowerCase().includes(q) && !src.host.toLowerCase().includes(q)) {
        continue;
      }
    }

    const override = overrides[src.id];
    sources.push({
      id: src.id,
      name: src.name,
      host: src.host,
      language: src.language,
      riskLevel: src.riskLevel,
      status: src.status,
      version: src.version,
      weight: 100,
      enabledByDefault: src.enabledByDefault,
      failureCount: src.failureCount,
      ok,
      healthReason: healthReasonMap.get(src.id) || '',
      checkedAt: healthCheckedMap.get(src.id) || null,
      locallyEnabled: override?.locallyEnabled ?? src.enabledByDefault,
      locallyDisabled: override?.locallyDisabled ?? false,
    });
  }

  // 排序：低风险 → 中风险，然后按名称
  sources.sort((a, b) => {
    const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, blocked: 3 };
    const ra = riskOrder[a.riskLevel] ?? 9;
    const rb = riskOrder[b.riskLevel] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'zh');
  });

  return { sources, manifest, fromCache, error };
}

/**
 * 强制刷新远程数据（绕过缓存）
 */
export async function refreshRemoteSources(): Promise<{
  manifest: ComicfsManifest;
  index: ComicfsIndex;
  health: ComicfsSourceHealth;
  elapsedMs: number;
}> {
  const start = Date.now();

  invalidateCache(CK_MANIFEST);
  invalidateCache(CK_INDEX);
  invalidateCache(CK_HEALTH);

  const [manifest, index, health] = await Promise.all([
    fetchManifest(),
    fetchIndex(),
    fetchSourceHealth().catch(() => null),
  ]);

  setCache(CK_MANIFEST, manifest, MANIFEST_TTL);
  setCache(CK_INDEX, index, INDEX_TTL);

  const effectiveHealth =
    health || ({ items: [], generatedAt: '', total: 0, checked: 0, networkCheckEnabled: false, stateChanges: 0 } as ComicfsSourceHealth);

  if (health) {
    setCache(CK_HEALTH, health, HEALTH_TTL);
  }

  return {
    manifest,
    index,
    health: effectiveHealth,
    elapsedMs: Date.now() - start,
  };
}

/**
 * 按 ID 获取单个源完整规则
 * 安全门：blocked/high 风险源返回 null
 */
export async function getSourceById(
  id: string,
): Promise<{ source: ComicfsSource; fromCache: boolean } | null> {
  const cacheKey = `${CK_SOURCE_PREFIX}${id}`;
  const cached = getCached<ComicfsSource>(cacheKey);

  if (cached) {
    return { source: cached.data, fromCache: true };
  }

  try {
    const source = await fetchSourceById(id);

    // 安全门：blocked/high 不缓存、不返回
    if (source.riskLevel === 'blocked' || source.riskLevel === 'high') {
      console.warn(`[comicfs] Blocked source access: ${id} (riskLevel=${source.riskLevel})`);
      return null;
    }

    setCache(cacheKey, source, SOURCE_TTL);
    return { source, fromCache: false };
  } catch {
    // 网络失败 + 无缓存 → null
    return null;
  }
}

/**
 * 清除所有 comicfs 缓存（包括本地覆盖）
 */
export function clearAllComicfsCache(): void {
  invalidateAll();
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(OVERRIDES_KEY);
    }
  } catch {
    // ignore
  }
}
