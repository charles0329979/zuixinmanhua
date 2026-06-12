// ============================================================
// comicfs 缓存层 — 同构实现
//   浏览器端：localStorage (持久化)
//   服务端：内存 Map (Next.js API Route 进程内共享)
// ============================================================

// ---- TTL 常量 ----
export const MANIFEST_TTL = 10 * 60 * 1000; // 10 分钟
export const INDEX_TTL = 60 * 60 * 1000; // 1 小时
export const SOURCE_TTL = 24 * 60 * 60 * 1000; // 24 小时（源规则很少变）
export const HEALTH_TTL = 30 * 60 * 1000; // 30 分钟

// ---- 缓存条目 ----
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  version?: string; // 关联的 manifest version，便于批量失效
}

// ---- 缓存 key 前缀 ----
const KEY_PREFIX = 'comicfs:cache:';

function cacheKey(name: string): string {
  return `${KEY_PREFIX}${name}`;
}

// ---- 服务端内存缓存 ----
const MAX_SERVER_CACHE_SIZE = 100; // LRU 上限，防止无限增长
const serverCache = new Map<string, CacheEntry<unknown>>();

// ---- 环境检测 ----
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

// ==================== 读取 ====================

/** 获取缓存（仅未过期） */
export function getCached<T>(key: string): CacheEntry<T> | null {
  try {
    if (isBrowser()) {
      const raw = localStorage.getItem(cacheKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() - entry.timestamp > entry.ttl) {
        // 过期，不返回
        return null;
      }
      return entry;
    }

    const entry = serverCache.get(cacheKey(key)) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) return null;
    return entry;
  } catch {
    return null;
  }
}

/** 获取缓存（包括过期数据），返回 freshness 标记 */
export function getCachedOrStale<T>(
  key: string,
): { data: T; fresh: boolean } | null {
  try {
    if (isBrowser()) {
      const raw = localStorage.getItem(cacheKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      return { data: entry.data, fresh: Date.now() - entry.timestamp <= entry.ttl };
    }

    const entry = serverCache.get(cacheKey(key)) as CacheEntry<T> | undefined;
    if (!entry) return null;
    return { data: entry.data, fresh: Date.now() - entry.timestamp <= entry.ttl };
  } catch {
    return null;
  }
}

// ==================== 写入 ====================

/** 写入缓存 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  };

  try {
    if (isBrowser()) {
      localStorage.setItem(cacheKey(key), JSON.stringify(entry));
    } else {
      // LRU eviction: 超过上限时删除最旧的条目
      if (serverCache.size >= MAX_SERVER_CACHE_SIZE) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, v] of serverCache) {
          if (v.timestamp < oldestTime) {
            oldestTime = v.timestamp;
            oldestKey = k;
          }
        }
        if (oldestKey) serverCache.delete(oldestKey);
      }
      serverCache.set(cacheKey(key), entry as CacheEntry<unknown>);
    }
  } catch (error) {
    // localStorage 满时静默降级（不清除已有数据）
    if (isBrowser()) {
      console.warn('[comicfs:cache] Failed to write cache:', error);
    }
  }
}

// ==================== 清除 ====================

/** 清除单个缓存 */
export function invalidateCache(key: string): void {
  try {
    if (isBrowser()) {
      localStorage.removeItem(cacheKey(key));
    } else {
      serverCache.delete(cacheKey(key));
    }
  } catch {
    // ignore
  }
}

/** 清除所有 comicfs 缓存 */
export function invalidateAll(): void {
  try {
    if (isBrowser()) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } else {
      serverCache.clear();
    }
  } catch {
    // ignore
  }
}

// ==================== 工具 ====================

/** 判断缓存是否过期 */
export function isStale(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.timestamp > entry.ttl;
}

/** 获取缓存剩余有效时间（ms），负数表示已过期 */
export function remainingTTL(entry: CacheEntry<unknown>): number {
  return entry.ttl - (Date.now() - entry.timestamp);
}
