// ============================================================
// packages/source-engine/src/search-ranker.ts
// Search result ranking (mirrors server search-ranker.ts)
// ============================================================

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[《》「」『』【】\s\-_.,;:!?，。！？；：、·]/g, '').trim();
}

export function scoreResult(title: string, keyword: string, _author?: string): number {
  if (!title || !keyword) return 0;
  const kw = keyword.trim().toLowerCase();
  const titleLower = title.toLowerCase();
  const titleNorm = normalize(title);
  const kwNorm = normalize(kw);

  if (titleLower === kw) return 100;
  if (titleNorm === kwNorm) return 95;
  if (titleLower.includes(kw)) return 90;
  if (titleNorm.includes(kwNorm)) return 85;
  if (titleNorm.includes(kw)) return 80;

  const parts = kw.split(/\s+/).filter(p => p.length > 0);
  if (parts.some(part => titleLower.includes(part))) return 40;
  if (kw.length >= 2 && titleLower.includes(kw[0]!) && titleLower.includes(kw[1]!)) return 25;
  if (kw.length >= 1 && titleLower.includes(kw[0]!)) return 15;
  return 5;
}

export function getMatchLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
