// ============================================================
// apps/mobile/src/store/useLibraryStore.ts
// Zustand — 收藏 + 阅读进度 + 历史
// ★ SQLite primary, in-memory Zustand fallback (prevents crashes)
// ============================================================

import { create } from 'zustand';

// ---- Types ----

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
  dbAvailable: boolean; // true = SQLite, false = memory fallback

  loadFavorites: () => Promise<void>;
  loadProgress: () => Promise<void>;
  loadHistory: () => Promise<void>;

  addFavorite: (item: Omit<FavoriteItem, 'id' | 'addedAt'>) => Promise<void>;
  removeFavorite: (source: string, comicId: string) => Promise<void>;

  updateProgress: (item: Omit<ProgressItem, 'id' | 'lastReadAt'>) => Promise<void>;
  addHistory: (item: Omit<HistoryItem, 'id' | 'lastReadAt'>) => Promise<void>;
}

// Lazy DB import — only load if available
let dbModule: any = null;
let dbAvailableFlag = false;

async function ensureDb(): Promise<boolean> {
  if (dbAvailableFlag) return true;
  if (dbModule === false) return false; // already tried and failed

  try {
    const { getDatabase } = require('../database');
    await getDatabase();
    const { getAllFavorites, getAllProgress, getAllHistory } = require('../database/repositories');
    dbModule = { getAllFavorites, getAllProgress, getAllHistory };
    dbAvailableFlag = true;
    console.log('[LibraryStore] SQLite storage active');
    return true;
  } catch (e: any) {
    console.warn('[LibraryStore] SQLite unavailable, using in-memory fallback:', e.message);
    dbModule = false;
    dbAvailableFlag = false;
    return false;
  }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  favorites: [],
  progress: {},
  history: [],
  isLoading: false,
  dbAvailable: false,

  // ---- Loaders ----

  loadFavorites: async () => {
    try {
      const ok = await ensureDb();
      if (ok && dbModule) {
        const rows = await dbModule.getAllFavorites();
        const favs: FavoriteItem[] = rows.map((r: any) => ({
          id: r.id,
          comicId: r.comic_id,
          title: r.title,
          source: r.source,
          cover: r.cover || undefined,
          author: r.author || undefined,
          lastChapter: r.last_chapter || undefined,
          status: r.status,
          addedAt: r.added_at,
        }));
        set({ favorites: favs, dbAvailable: true });
      } else {
        set({ dbAvailable: false });
      }
    } catch (e: any) {
      console.warn('[LibraryStore] loadFavorites failed:', e.message);
      set({ dbAvailable: false });
    }
  },

  loadProgress: async () => {
    try {
      const ok = await ensureDb();
      if (ok && dbModule) {
        const rows = await dbModule.getAllProgress();
        const prog: Record<string, ProgressItem> = {};
        for (const r of rows) {
          prog[r.id] = {
            id: r.id,
            comicId: r.comic_id,
            comicTitle: r.comic_title,
            source: r.source,
            chapterId: r.chapter_id,
            chapterTitle: r.chapter_title || undefined,
            pageIndex: r.page_index,
            lastReadAt: r.last_read_at,
          };
        }
        set({ progress: prog, dbAvailable: true });
      }
    } catch (e: any) {
      console.warn('[LibraryStore] loadProgress failed:', e.message);
    }
  },

  loadHistory: async () => {
    try {
      const ok = await ensureDb();
      if (ok && dbModule) {
        const rows = await dbModule.getAllHistory();
        const hist: HistoryItem[] = rows.map((r: any) => ({
          id: r.id,
          comicId: r.comic_id,
          title: r.title,
          source: r.source,
          cover: r.cover || undefined,
          chapterTitle: r.chapter_title || undefined,
          lastReadAt: r.last_read_at,
        }));
        set({ history: hist, dbAvailable: true });
      }
    } catch (e: any) {
      console.warn('[LibraryStore] loadHistory failed:', e.message);
    }
  },

  // ---- Mutations ----

  addFavorite: async (item) => {
    try {
      const ok = await ensureDb();
      if (ok) {
        const { addFavorite: dbAddFav } = require('../database/repositories');
        await dbAddFav({
          comic_id: item.comicId,
          title: item.title,
          source: item.source,
          author: item.author || null,
          cover: item.cover || null,
          last_chapter: item.lastChapter || null,
          status: item.status,
        });
      }
    } catch (e: any) {
      console.warn('[LibraryStore] addFavorite DB failed, using memory:', e.message);
    }
    // Always update Zustand state (in-memory fallback)
    const id = `${item.source}:${item.comicId}`;
    const newFav: FavoriteItem = { ...item, id, addedAt: Date.now() };
    set((s) => ({ favorites: [...s.favorites.filter((f) => f.id !== id), newFav] }));
  },

  removeFavorite: async (source, comicId) => {
    try {
      const ok = await ensureDb();
      if (ok) {
        const { removeFavorite: dbRemoveFav } = require('../database/repositories');
        await dbRemoveFav(source, comicId);
      }
    } catch (e: any) {
      console.warn('[LibraryStore] removeFavorite DB failed:', e.message);
    }
    // Always update Zustand state
    const id = `${source}:${comicId}`;
    set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) }));
  },

  updateProgress: async (item) => {
    try {
      const ok = await ensureDb();
      if (ok) {
        const { upsertProgress } = require('../database/repositories');
        await upsertProgress({
          comicId: item.comicId,
          comicTitle: item.comicTitle,
          source: item.source,
          chapterId: item.chapterId,
          chapterTitle: item.chapterTitle,
          pageIndex: item.pageIndex,
        });
      }
    } catch (e: any) {
      console.warn('[LibraryStore] updateProgress DB failed:', e.message);
    }
    // Always update Zustand state
    const id = `${item.source}:${item.comicId}`;
    set((s) => ({
      progress: {
        ...s.progress,
        [id]: { ...item, id, lastReadAt: Date.now() },
      },
    }));
  },

  addHistory: async (item) => {
    try {
      const ok = await ensureDb();
      if (ok) {
        const { addHistory: dbAddHistory } = require('../database/repositories');
        await dbAddHistory({
          comicId: item.comicId,
          title: item.title,
          source: item.source,
          cover: item.cover,
          chapterTitle: item.chapterTitle,
        });
      }
    } catch (e: any) {
      console.warn('[LibraryStore] addHistory DB failed:', e.message);
    }
    // Always update Zustand state
    const entry: HistoryItem = {
      ...item,
      id: `${item.source}:${item.comicId}:${Date.now()}`,
      lastReadAt: Date.now(),
    };
    set((s) => ({ history: [entry, ...s.history].slice(0, 100) }));
  },
}));
