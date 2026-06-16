// ============================================================
// apps/mobile/src/hooks/useSearch.ts
// ★ 共享搜索 Hook — 调用 server API
// ============================================================

import { useState, useCallback } from 'react';
import * as api from '../api/client';

export interface DisplayResult {
  id: string;
  comicId: string;
  title: string;
  cover: string;
  source: string;
  sourceName: string;
  author?: string;
  latestChapter?: string;
  status?: string;
}

export function useSearch() {
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doSearch = useCallback(async (query: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.search(query);
      const sources = data.sources || [];
      const allResults = sources.flatMap(
        (s) =>
          (s.results || []).map((r) => ({
            id: `${s.source}:${r.comicId}`,
            comicId: r.comicId,
            title: r.title,
            cover: r.cover || '',
            source: s.source,
            sourceName: s.sourceName,
            author: r.author,
            latestChapter: r.lastChapter,
            status: r.status,
          })),
      );
      setResults(allResults);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, search: doSearch };
}
