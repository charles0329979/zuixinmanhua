// ============================================================
// GET /api/debug/search-sources?keyword=斗破苍穹&limit=20
// 批量诊断 — 并发 2，检测多个源，生成 recommendedSourceIds
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { diagnoseSourceBatch } from '@/lib/search/diagnose-source-search';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword') || '斗破苍穹';
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '20', 10) || 20,
    50,
  );

  try {
    const result = await diagnoseSourceBatch(keyword, limit);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      keyword,
      limit,
      total: 0,
      passed: 0,
      failed: 0,
      items: [],
      recommendedSourceIds: [],
      error: `Batch diagnosis failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
