// ============================================================
// GET /api/debug/search — 搜索系统调试信息
// ============================================================
import { NextResponse } from 'next/server';
import { getActiveSources } from '@/lib/comicfs/source-loader';

export async function GET() {
  let activeSourceCount = 0;
  let selectedSourceCount = 0;
  const sampleSources: Array<Record<string, unknown>> = [];
  let error: string | null = null;

  try {
    const result = await getActiveSources({ onlyOk: false });
    const allSources = result.sources;

    // 应用与搜索服务相同的过滤
    const filtered = allSources.filter((s) => {
      if (s.riskLevel !== 'low' && s.riskLevel !== 'medium') return false;
      if (s.status !== 'active') return false;
      if (s.healthReason === 'network-unreachable') return false;
      if (s.checkedAt && !s.ok) return false;
      return true;
    });

    activeSourceCount = allSources.length;
    selectedSourceCount = filtered.length;

    for (const s of filtered.slice(0, 10)) {
      sampleSources.push({
        id: s.id, name: s.name, host: s.host,
        riskLevel: s.riskLevel, status: s.status,
        ok: s.ok, language: s.language,
      });
    }
  } catch (err) {
    error = String(err);
  }

  return NextResponse.json({
    comicfsLoaded: activeSourceCount > 0,
    activeSourceCount,
    selectedSourceCount,
    sampleSources,
    error,
  });
}
