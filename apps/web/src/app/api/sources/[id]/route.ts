// ============================================================
// GET /api/sources/[id]
// 返回单个 comicfs 源完整规则
// blocked/high 风险源返回 403
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getSourceById } from '@/lib/comicfs/source-loader';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_.\-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 });
  }

  try {
    const result = await getSourceById(id);

    if (!result) {
      return NextResponse.json({ error: 'Source not found or blocked' }, { status: 404 });
    }

    // 额外安全门：在 API 层再次检查
    if (result.source.riskLevel === 'blocked' || result.source.riskLevel === 'high') {
      return NextResponse.json(
        { error: `Source blocked due to risk level: ${result.source.riskLevel}` },
        { status: 403 },
      );
    }

    const response = NextResponse.json({
      source: result.source,
      fromCache: result.fromCache,
    });

    // 源规则缓存 1 小时
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return response;
  } catch (error) {
    console.error(`[comicfs:api] /api/sources/${id} error:`, error);
    return NextResponse.json(
      { error: `Failed to load source: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
