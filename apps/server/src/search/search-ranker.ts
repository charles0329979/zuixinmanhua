// ============================================================
// apps/server/src/search/search-ranker.ts
// ★ 搜索结果精准评分 + 过滤
// ============================================================

export interface RankedResult {
  title: string;
  cover: string;
  detailUrl: string;
  comicId: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'hardcoded' | 'rule' | 'comicfs';
  author?: string;
  latestChapter?: string;
  status?: string;
  matchScore: number;
  matchLevel: 'high' | 'medium' | 'low';
  responseTimeMs?: number;
}

const MIN_SCORE = 20;

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[《》「」『』【】\s\-_.,;:!?，。！？；：、·]/g, '')
    .trim();
}

function containsFullKeyword(title: string, keyword: string): boolean {
  return title.toLowerCase().includes(keyword.toLowerCase());
}

function containsKeywordParts(title: string, keyword: string): boolean {
  const parts = keyword.split(/\s+/).filter(p => p.length > 0);
  return parts.some(part => title.includes(part));
}

/** Score a single result against the search keyword */
export function scoreResult(
  title: string,
  keyword: string,
  author?: string,
  description?: string,
): number {
  if (!title || !keyword) return 0;

  const kw = keyword.trim();
  const kwLower = kw.toLowerCase();
  const titleLower = title.toLowerCase();
  const titleNorm = normalize(title);
  const kwNorm = normalize(kw);

  let score = 0;

  // Exact match
  if (titleLower === kwLower) {
    score = 100;
  } else if (titleNorm === kwNorm) {
    score = 95;
  } else if (containsFullKeyword(titleLower, kwLower)) {
    // Title contains full keyword phrase
    score = 90;
  } else if (titleNorm.includes(kwNorm)) {
    // Normalized title contains normalized keyword
    score = 85;
  } else if (containsFullKeyword(titleNorm, kwNorm)) {
    score = 80;
  } else if (containsKeywordParts(titleLower, kwLower)) {
    // Title contains at least one word from keyword
    score = 40;
  } else if (kw.length >= 2 && titleLower.includes(kw[0] || '') && titleLower.includes(kw[1] || '')) {
    // At least 2 chars from keyword appear in title
    score = 25;
  } else if (kw.length >= 1 && titleLower.includes(kw[0] || '')) {
    // At least 1 char matches (very weak)
    score = 15;
  } else {
    // No meaningful relationship
    score = 5;
  }

  // Author bonus
  if (author && author.toLowerCase().includes(kwLower)) {
    score += 10;
  }

  // Description bonus
  if (description && description.toLowerCase().includes(kwLower)) {
    score += 5;
  }

  return Math.min(100, score);
}

export function getMatchLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/** Rank and filter results from one source */
export function rankAndFilter(
  results: Omit<RankedResult, 'matchScore' | 'matchLevel'>[],
  keyword: string,
  minScore: number = MIN_SCORE,
): RankedResult[] {
  const scored = results.map(r => {
    const score = scoreResult(r.title, keyword, r.author);
    return { ...r, matchScore: score, matchLevel: getMatchLevel(score) };
  });

  // Sort by score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);

  // Filter below threshold
  const filtered = scored.filter(r => r.matchScore >= minScore);

  return filtered;
}
