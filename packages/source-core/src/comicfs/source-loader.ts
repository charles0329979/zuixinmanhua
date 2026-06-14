// ============================================================
// packages/source-core/src/comicfs/source-loader.ts
// 远程源加载编排 — manifest → index → health → sources
// ============================================================

import type {
  ComicfsManifest, ComicfsIndex, ComicfsSourceHealth,
  ComicfsSourceSummary, ComicfsSource,
} from '@zuixinmanhua/types';
import {
  fetchManifest, fetchIndex, fetchSourceHealth, fetchSourceById,
} from './client';

export interface ActiveSourceFilter {
  riskLevels?: string[];
  statuses?: string[];
  languages?: string[];
  search?: string;
  onlyOk?: boolean;
}

export interface RemoteSourceDisplay {
  id: string;
  name: string;
  host: string;
  language: string;
  riskLevel: string;
  status: string;
  version: string;
  weight: number;
  enabledByDefault: boolean;
  failureCount: number;
  ok: boolean;
  healthReason: string;
  checkedAt: string | null;
}

const DEFAULT_FILTER: Required<ActiveSourceFilter> = {
  riskLevels: ['low', 'medium'],
  statuses: ['active'],
  languages: [],
  search: '',
  onlyOk: false,
};

/**
 * 获取活跃源列表（过滤 + 合并健康状态）
 */
export async function getActiveSources(
  filter?: ActiveSourceFilter,
): Promise<{
  sources: RemoteSourceDisplay[];
  manifest: ComicfsManifest | null;
  index: ComicfsIndex | null;
  error?: string;
}> {
  const f = { ...DEFAULT_FILTER, ...filter };
  let manifest: ComicfsManifest | null = null;
  let index: ComicfsIndex | null = null;
  let health: ComicfsSourceHealth | null = null;
  let error: string | undefined;

  try { manifest = await fetchManifest(); } catch (e: any) { error = e.message; }
  try { index = await fetchIndex(); } catch (e: any) { error = error || e.message; }
  try { health = await fetchSourceHealth(); } catch { /* non-fatal */ }

  if (!index) {
    return { sources: [], manifest, index: null, error };
  }

  // Build health map
  const healthMap = new Map<string, boolean>();
  const healthReason = new Map<string, string>();
  const healthChecked = new Map<string, string>();
  if (health?.items) {
    for (const item of health.items) {
      healthMap.set(item.id, item.ok);
      healthReason.set(item.id, item.reason);
      healthChecked.set(item.id, item.checkedAt);
    }
  }

  // Filter + merge
  const sources: RemoteSourceDisplay[] = [];
  for (const src of index.sources) {
    if (f.riskLevels.length > 0 && !f.riskLevels.includes(src.riskLevel)) continue;
    if (f.statuses.length > 0 && !f.statuses.includes(src.status)) continue;
    if (f.languages.length > 0 && !f.languages.includes(src.language)) continue;
    const ok = healthMap.has(src.id) ? healthMap.get(src.id)! : true;
    if (f.onlyOk && !ok) continue;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!src.name.toLowerCase().includes(q) && !src.host.toLowerCase().includes(q)) continue;
    }

    sources.push({
      id: src.id, name: src.name, host: src.host,
      language: src.language, riskLevel: src.riskLevel, status: src.status,
      version: src.version, weight: 100,
      enabledByDefault: src.enabledByDefault, failureCount: src.failureCount,
      ok,
      healthReason: healthReason.get(src.id) || '',
      checkedAt: healthChecked.get(src.id) || null,
    });
  }

  sources.sort((a, b) => {
    const order: Record<string, number> = { low: 0, medium: 1, high: 2, blocked: 3 };
    const ra = order[a.riskLevel] ?? 9;
    const rb = order[b.riskLevel] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'zh');
  });

  return { sources, manifest, index, error };
}

/**
 * 按 ID 获取单个源完整规则
 */
export async function getSourceById(
  id: string,
): Promise<ComicfsSource | null> {
  const source = await fetchSourceById(id);
  if (!source) return null;

  // Safety gate
  if (source.riskLevel === 'blocked' || source.riskLevel === 'high') {
    console.warn(`[comicfs] Blocked source: ${id} (${source.riskLevel})`);
    return null;
  }

  return source;
}
