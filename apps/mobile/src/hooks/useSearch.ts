// ============================================================
// apps/mobile/src/hooks/useSearch.ts
// ★ 共享搜索 Hook — 从服务端聚合搜索
// ============================================================

import { useState, useCallback } from 'react';

const API_BASE = 'http://10.0.2.2:3001/api'; // Android emulator → host
// const API_BASE = 'http://localhost:3001/api'; // iOS simulator / dev

interface SearchResult {
  id: string;
  title: string;
  cover: string;
  sourceId: string;
  sourceName: string;
  author?: string;
  latestChapter?: string;
  status?: string;
  detailUrl: string;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      const sources = data.sources || [];
      const allResults = sources.flatMap(
        (s: any) =>
          (s.results || []).map((r: any) => ({
            id: `${s.sourceId}:${r.detailUrl}`,
            title: r.title,
            cover: r.cover,
            sourceId: s.sourceId,
            sourceName: s.sourceName,
            author: r.author,
            latestChapter: r.latestChapter,
            status: r.status,
            detailUrl: r.detailUrl,
          })),
      );
      setResults(allResults);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, search };
}
