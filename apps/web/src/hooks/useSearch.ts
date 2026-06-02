'use client';
import { useState, useCallback } from 'react';
import type { SourceSearchResult } from '@/types';
import { searchAll } from '@/lib/api';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SourceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    setError('');
    try {
      const data = await searchAll(q.trim());
      setResults(data.sources || []);
    } catch (e: any) {
      setError(e.message || '搜索失败');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { query, results, loading, error, search };
}
