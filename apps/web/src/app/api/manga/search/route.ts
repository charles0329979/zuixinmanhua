// ============================================================
// GET /api/manga/search?keyword=xxx&maxSources=10&dryRun=1
// 聚合搜索 — 并发搜索 comicfs 远程书源
// 永远返回 200 + 结构化 JSON (ok: true/false)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { aggregatedSearch } from '@/lib/manga-search/search-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const keyword = searchParams.get('keyword') || searchParams.get('q') || '';
  const maxSources = parseInt(searchParams.get('maxSources') || '10', 10);
  const dedupe = searchParams.get('dedupe') !== 'false';
  const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true';

  if (!keyword.trim()) {
    return NextResponse.json({
      ok: false,
      keyword: '',
      total: 0,
      durationMs: 0,
      sourceCount: 0,
      successSourceCount: 0,
      failedSourceCount: 0,
      results: [],
      errors: [{ sourceId: '*', sourceName: 'input', reason: 'keyword is required', scope: 'search-api' }],
    });
  }

  try {
    const response = await aggregatedSearch({
      keyword: keyword.trim(),
      maxSources: Math.min(maxSources, 20),
      dedupe,
      dryRun,
    });

    // 计算 durationMs（在 search-service 中可能未正确填充）
    response.durationMs = response.durationMs || 0;

    return NextResponse.json(response);
  } catch (error) {
    console.error('[manga-search] Fatal error:', error);
    return NextResponse.json({
      ok: false,
      keyword,
      total: 0,
      durationMs: 0,
      sourceCount: 0,
      successSourceCount: 0,
      failedSourceCount: 0,
      results: [],
      errors: [
        {
          sourceId: '*',
          sourceName: 'server',
          reason: `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
          scope: 'search-api',
        },
      ],
    });
  }
}
