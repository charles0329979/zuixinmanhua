// ============================================================
// GET /api/debug/comicfs
// 调试端点 — 查看 comicfs 加载状态
// ============================================================
import { NextResponse } from 'next/server';
import { getActiveSources } from '@/lib/comicfs/source-loader';
import { getCachedOrStale } from '@/lib/comicfs/cache';
import type { ComicfsManifest, ComicfsIndex, ComicfsSourceHealth } from '@/lib/comicfs/types';

export async function GET() {
  const manifestEntry = getCachedOrStale<ComicfsManifest>('manifest');
  const indexEntry = getCachedOrStale<ComicfsIndex>('index');
  const healthEntry = getCachedOrStale<ComicfsSourceHealth>('source-health');

  const manifestLoaded = !!manifestEntry;
  const indexLoaded = !!indexEntry;
  const healthLoaded = !!healthEntry;

  const manifest = manifestEntry?.data;
  const index = indexEntry?.data;
  const health = healthEntry?.data;

  // 获取活跃源
  let activeSourceCount = 0;
  let sampleSources: Array<Record<string, unknown>> = [];
  let sourceLoadError: string | null = null;

  try {
    const result = await getActiveSources({ onlyOk: false });
    activeSourceCount = result.sources.length;
    sampleSources = result.sources.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      riskLevel: s.riskLevel,
      status: s.status,
      ok: s.ok,
      language: s.language,
    }));
    sourceLoadError = result.error || null;
  } catch (err) {
    sourceLoadError = String(err);
  }

  // 风险分布
  let lowCount = 0;
  let mediumCount = 0;
  let highCount = 0;
  let blockedCount = 0;
  if (index?.sources) {
    for (const s of index.sources) {
      if (s.riskLevel === 'low') lowCount++;
      else if (s.riskLevel === 'medium') mediumCount++;
      else if (s.riskLevel === 'high') highCount++;
      else if (s.riskLevel === 'blocked') blockedCount++;
    }
  }

  return NextResponse.json({
    manifestLoaded,
    manifestFresh: manifestEntry?.fresh ?? false,
    manifestVersion: manifest?.version ?? null,
    manifestUpdatedAt: manifest?.updatedAt ?? null,

    indexLoaded,
    indexFresh: indexEntry?.fresh ?? false,
    sourceCount: index?.count ?? 0,
    riskDistribution: { low: lowCount, medium: mediumCount, high: highCount, blocked: blockedCount },

    healthLoaded,
    healthFresh: healthEntry?.fresh ?? false,
    healthSourceCount: health?.total ?? 0,
    healthCheckedCount: health?.checked ?? 0,

    activeSourceCount,
    sourceLoadError,
    sampleSources,
  });
}
