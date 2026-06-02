'use client';
import { useState, useEffect, useCallback } from 'react';
import type { ReadingProgress } from '@/types';
import { getReadingProgress, saveReadingProgress, getAllReadingProgress } from '@/lib/db';

export function useReadingProgress(source?: string, comicId?: string) {
  const [progress, setProgress] = useState<ReadingProgress | undefined>();
  const [allProgress, setAllProgress] = useState<ReadingProgress[]>([]);

  const refresh = useCallback(async () => {
    if (source && comicId) {
      const p = await getReadingProgress(source, comicId);
      setProgress(p);
    }
    const all = await getAllReadingProgress();
    setAllProgress(all.sort((a, b) => b.lastReadAt - a.lastReadAt));
  }, [source, comicId]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (data: Omit<ReadingProgress, 'id' | 'lastReadAt'>) => {
    await saveReadingProgress(data);
    await refresh();
  }, [refresh]);

  return { progress, allProgress, save, refresh };
}
