// ============================================================
// POST /api/sources/refresh
// 强制重新拉取 comicfs manifest/index/source-health（绕过缓存）
// ============================================================
import { NextResponse } from 'next/server';
import { refreshRemoteSources } from '@/lib/comicfs/source-loader';

export async function POST() {
  try {
    const result = await refreshRemoteSources();

    return NextResponse.json({
      success: true,
      manifest: {
        version: result.manifest.version,
        updatedAt: result.manifest.updatedAt,
        sourceCount: result.manifest.sourceCount,
      },
      index: {
        version: result.index.version,
        updatedAt: result.index.updatedAt,
        count: result.index.count,
      },
      health: {
        total: result.health.total,
        checked: result.health.checked,
        generatedAt: result.health.generatedAt,
      },
      elapsedMs: result.elapsedMs,
    });
  } catch (error) {
    console.error('[comicfs:api] /api/sources/refresh error:', error);
    return NextResponse.json(
      { success: false, error: `Refresh failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
