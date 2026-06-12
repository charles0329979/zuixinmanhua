// ============================================================
// GET /api/debug/search-source?id=SOURCE_ID&keyword=斗破苍穹
// 单源诊断 — 逐步检测搜索链路，永远返回 200 + JSON
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { diagnoseSourceSearch } from '@/lib/search/diagnose-source-search';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sourceId = url.searchParams.get('id') || '';
  const keyword = url.searchParams.get('keyword') || '斗破苍穹';

  if (!sourceId) {
    return NextResponse.json({
      ok: false,
      sourceId: '',
      sourceName: '',
      host: '',
      keyword,
      failedAt: 'source-load' as const,
      error: { code: 'MISSING_ID', message: 'sourceId is required (?id=SOURCE_ID)' },
      steps: {
        sourceLoaded: false, searchRuleFound: false, searchUrlBuilt: false,
        urlSafe: false, fetchOk: false, httpStatus: 0, contentType: '',
        htmlLength: 0, containsKeyword: false, selectorFound: false,
        itemCount: 0, parsedCount: 0,
      },
      search: {
        rawSearchUrl: '', finalSearchUrl: '',
        listSelector: '', titleSelector: '', urlSelector: '', coverSelector: '',
      },
      sampleResults: [],
    });
  }

  try {
    const result = await diagnoseSourceSearch(sourceId, keyword);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      sourceId,
      sourceName: sourceId,
      host: '',
      keyword,
      failedAt: 'source-load' as const,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
      steps: {
        sourceLoaded: false, searchRuleFound: false, searchUrlBuilt: false,
        urlSafe: false, fetchOk: false, httpStatus: 0, contentType: '',
        htmlLength: 0, containsKeyword: false, selectorFound: false,
        itemCount: 0, parsedCount: 0,
      },
      search: {
        rawSearchUrl: '', finalSearchUrl: '',
        listSelector: '', titleSelector: '', urlSelector: '', coverSelector: '',
      },
      sampleResults: [],
    });
  }
}
