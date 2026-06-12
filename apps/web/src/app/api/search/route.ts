// ============================================================
// GET /api/search?keyword=xxx&dryRun=1&maxSources=10
// 统一搜索 API — 永返回 200 + 结构化 JSON + 诊断信息
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { unifiedSearch } from '@/lib/search/unified-search-service';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword') || url.searchParams.get('q') || '';
  const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true';
  const maxSources = Math.min(parseInt(url.searchParams.get('maxSources') || '10', 10) || 10, 20);

  if (!keyword.trim()) {
    return NextResponse.json({
      ok: false,
      keyword: '',
      dryRun: false,
      sourceCount: 0,
      successSourceCount: 0,
      failedSourceCount: 0,
      durationMs: 0,
      results: [],
      errors: [
        {
          sourceId: '*',
          sourceName: 'input',
          reason: 'keyword required',
          scope: 'search-api' as const,
        },
      ],
    });
  }

  try {
    const response = await unifiedSearch({ keyword: keyword.trim(), maxSources, dryRun });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      keyword,
      dryRun: false,
      sourceCount: 0,
      successSourceCount: 0,
      failedSourceCount: 0,
      durationMs: 0,
      results: [],
      errors: [
        {
          sourceId: '*',
          sourceName: 'server',
          reason: `fatal: ${error instanceof Error ? error.message : String(error)}`,
          scope: 'search-api' as const,
        },
      ],
    });
  }
}
