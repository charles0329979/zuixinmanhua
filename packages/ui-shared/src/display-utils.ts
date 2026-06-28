// Display utility functions

export function formatMatchScore(score: number): string {
  if (score >= 80) return '★高匹配';
  if (score >= 40) return '☆中匹配';
  return '低匹配';
}

export function getMatchColor(level: string): string {
  if (level === 'high') return '#34d399';
  if (level === 'medium') return '#fbbf24';
  return '#64748b';
}
