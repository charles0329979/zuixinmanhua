// ============================================================
// GET /api/debug/search-source?id=xxx&keyword=斗破苍穹
// 单源诊断 — 逐步检测搜索链路
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { diagnoseSourceSearch } from '@/lib/search/diagnose-source-search';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || '';
  const keyword = request.nextUrl.searchParams.get('keyword') || '斗破苍穹';

  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing ?id= parameter' }, { status: 400 });
  }

  try {
    const result = await diagnoseSourceSearch(id, keyword);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false, sourceId: id, sourceName: '', host: '', keyword,
      failedAt: 'source-load',
      error: `Fatal: ${error instanceof Error ? error.message : String(error)}`,
      steps: {},
      search: {},
      sampleResults: [],
    });
  }
}
