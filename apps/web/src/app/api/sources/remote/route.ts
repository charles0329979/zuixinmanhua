// ============================================================
// GET /api/sources/remote
// 返回 comicfs 远程书源摘要列表
// Query params:
//   ?riskLevel=low,medium  (逗号分隔)
//   ?status=active
//   ?language=zh
//   ?search=关键词
//   ?onlyOk=true
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getActiveSources, type ActiveSourceFilter } from '@/lib/comicfs/source-loader';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const riskLevels = searchParams.get('riskLevel')?.split(',').filter(Boolean) ?? undefined;
    const statuses = searchParams.get('status')?.split(',').filter(Boolean) ?? undefined;
    const languages = searchParams.get('language')?.split(',').filter(Boolean) ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const onlyOk = searchParams.get('onlyOk') === 'true';

    const filter: Partial<ActiveSourceFilter> = {};
    if (riskLevels) filter.riskLevels = riskLevels;
    if (statuses) filter.statuses = statuses;
    if (languages) filter.languages = languages;
    if (search) filter.search = search;
    if (onlyOk) filter.onlyOk = true;

    const result = await getActiveSources(filter);

    const response = NextResponse.json({
      sources: result.sources,
      count: result.sources.length,
      manifestVersion: result.manifest?.version ?? null,
      manifestUpdatedAt: result.manifest?.updatedAt ?? null,
      fromCache: result.fromCache,
      error: result.error ?? null,
    });

    // 缓存策略：数据新鲜时允许 CDN/浏览器缓存最多 5 分钟
    if (!result.error) {
      response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    } else {
      response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    }

    return response;
  } catch (error) {
    console.error('[comicfs:api] /api/sources/remote error:', error);
    return NextResponse.json(
      { sources: [], count: 0, error: `Internal error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
