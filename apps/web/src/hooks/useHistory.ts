'use client';
import { useState, useEffect, useCallback } from 'react';
import type { BrowseHistory } from '@/types';
import { getHistory, addHistory, removeHistory, clearHistory } from '@/lib/db';

export function useHistory() {
  const [history, setHistory] = useState<BrowseHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await getHistory();
    setHistory(data.sort((a, b) => b.lastReadAt - a.lastReadAt));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (entry: Omit<BrowseHistory, 'id' | 'lastReadAt'>) => {
    await addHistory(entry);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await removeHistory(id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const clear = useCallback(async () => {
    await clearHistory();
    setHistory([]);
  }, []);

  return { history, loading, add, remove, clear };
}
