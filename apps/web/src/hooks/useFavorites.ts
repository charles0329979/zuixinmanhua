'use client';
import { useState, useEffect, useCallback } from 'react';
import type { FavoriteComic } from '@/types';
import { getFavorites, addFavorite, removeFavorite, isFavorite } from '@/lib/db';

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteComic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFavorites().then(setFavorites).finally(() => setLoading(false));
  }, []);

  const toggle = useCallback(async (comic: Omit<FavoriteComic, 'id' | 'addedAt'>) => {
    const fav = await isFavorite(comic.source, comic.comicId);
    if (fav) {
      await removeFavorite(comic.source, comic.comicId);
      setFavorites((prev) => prev.filter((f) => !(f.source === comic.source && f.comicId === comic.comicId)));
      return false;
    } else {
      await addFavorite(comic);
      const id = `${comic.source}:${comic.comicId}`;
      setFavorites((prev) => [{ ...comic, id, addedAt: Date.now() }, ...prev]);
      return true;
    }
  }, []);

  const checkFavorite = useCallback(async (source: string, comicId: string) => {
    return isFavorite(source, comicId);
  }, []);

  return { favorites, loading, toggle, checkFavorite };
}
