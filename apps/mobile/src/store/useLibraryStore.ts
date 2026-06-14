// ============================================================
// apps/mobile/src/store/useLibraryStore.ts
// Zustand — 收藏 + 阅读进度 + 历史 (接入 expo-sqlite)
// ============================================================

import { create } from 'zustand';
import {
  getAllFavorites, addFavorite as dbAddFav, removeFavorite as dbRemoveFav,
  getAllProgress, upsertProgress,
  getAllHistory, addHistory as dbAddHistory,
} from '../database/repositories';

interface FavoriteItem {
  id: string; comicId: string; title: string; source: string;
  cover?: string; author?: string; lastChapter?: string;
  status: string; addedAt: number;
}

interface ProgressItem {
  id: string; comicId: string; comicTitle: string; source: string;
  chapterId: string; chapterTitle?: string;
  pageIndex: number; lastReadAt: number;
}

interface HistoryItem {
  id: string; comicId: string; title: string; source: string;
  cover?: string; chapterTitle?: string; lastReadAt: number;
}

interface LibraryState {
  favorites: FavoriteItem[];
  progress: Record<string, ProgressItem>;
  history: HistoryItem[];
  isLoading: boolean;

  loadFavorites: () => Promise<void>;
  loadProgress: () => Promise<void>;
  loadHistory: () => Promise<void>;

  addFavorite: (item: Omit<FavoriteItem, 'id' | 'addedAt'>) => Promise<void>;
  removeFavorite: (source: string, comicId: string) => Promise<void>;

  updateProgress: (item: Omit<ProgressItem, 'id' | 'lastReadAt'>) => Promise<void>;
  addHistory: (item: Omit<HistoryItem, 'id' | 'lastReadAt'>) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  favorites: [],
  progress: {},
  history: [],
  isLoading: false,

  loadFavorites: async () => {
    const rows = await getAllFavorites();
    const favs: FavoriteItem[] = rows.map((r) => ({
      id: r.id, comicId: r.comic_id, title: r.title,
      source: r.source, cover: r.cover || undefined,
      author: r.author || undefined, lastChapter: r.last_chapter || undefined,
      status: r.status, addedAt: r.added_at,
    }));
    set({ favorites: favs });
  },

  loadProgress: async () => {
    const rows = await getAllProgress();
    const prog: Record<string, ProgressItem> = {};
    for (const r of rows) {
      prog[r.id] = {
        id: r.id, comicId: r.comic_id, comicTitle: r.comic_title,
        source: r.source, chapterId: r.chapter_id,
        chapterTitle: r.chapter_title || undefined,
        pageIndex: r.page_index, lastReadAt: r.last_read_at,
      };
    }
    set({ progress: prog });
  },

  loadHistory: async () => {
    const rows = await getAllHistory();
    const hist: HistoryItem[] = rows.map((r) => ({
      id: r.id, comicId: r.comic_id, title: r.title,
      source: r.source, cover: r.cover || undefined,
      chapterTitle: r.chapter_title || undefined,
      lastReadAt: r.last_read_at,
    }));
    set({ history: hist });
  },

  addFavorite: async (item) => {
    await dbAddFav({
      comic_id: item.comicId, title: item.title, source: item.source,
      author: item.author || null, cover: item.cover || null,
      last_chapter: item.lastChapter || null, status: item.status,
    });
    await get().loadFavorites();
  },

  removeFavorite: async (source, comicId) => {
    await dbRemoveFav(source, comicId);
    await get().loadFavorites();
  },

  updateProgress: async (item) => {
    await upsertProgress({
      comicId: item.comicId, comicTitle: item.comicTitle,
      source: item.source, chapterId: item.chapterId,
      chapterTitle: item.chapterTitle, pageIndex: item.pageIndex,
    });
    const id = `${item.source}:${item.comicId}`;
    set((s) => ({
      progress: {
        ...s.progress,
        [id]: { ...item, id, lastReadAt: Date.now() },
      },
    }));
  },

  addHistory: async (item) => {
    await dbAddHistory({
      comicId: item.comicId, title: item.title, source: item.source,
      cover: item.cover, chapterTitle: item.chapterTitle,
    });
    const entry: HistoryItem = {
      ...item, id: `${item.source}:${item.comicId}:${Date.now()}`,
      lastReadAt: Date.now(),
    };
    set((s) => ({
      history: [entry, ...s.history].slice(0, 100),
    }));
  },
}));
