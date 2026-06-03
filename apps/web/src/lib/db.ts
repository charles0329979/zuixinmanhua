// ============================================================
// IndexedDB 本地存储 — 收藏、阅读进度、浏览历史
// ============================================================
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { FavoriteComic, ReadingProgress, BrowseHistory } from '@/types';

interface ComicDBSchema extends DBSchema {
  favorites: {
    key: string;
    value: FavoriteComic;
    indexes: { 'by-added': number };
  };
  readingProgress: {
    key: string;
    value: ReadingProgress;
    indexes: { 'by-lastRead': number };
  };
  history: {
    key: string;
    value: BrowseHistory;
    indexes: { 'by-lastRead': number };
  };
}

let dbPromise: Promise<IDBPDatabase<ComicDBSchema>>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ComicDBSchema>('comic-reader', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'id' });
          favStore.createIndex('by-added', 'addedAt');
        }
        if (!db.objectStoreNames.contains('readingProgress')) {
          const progressStore = db.createObjectStore('readingProgress', { keyPath: 'id' });
          progressStore.createIndex('by-lastRead', 'lastReadAt');
        }
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('by-lastRead', 'lastReadAt');
        }
      },
    });
  }
  return dbPromise;
}

// ==================== 收藏 ====================
export async function getFavorites(): Promise<FavoriteComic[]> {
  const db = await getDB();
  return db.getAllFromIndex('favorites', 'by-added');
}

export async function addFavorite(comic: Omit<FavoriteComic, 'id' | 'addedAt'>): Promise<void> {
  const db = await getDB();
  const id = `${comic.source}:${comic.comicId}`;
  await db.put('favorites', { ...comic, id, addedAt: Date.now() });
}

export async function removeFavorite(source: string, comicId: string): Promise<void> {
  const db = await getDB();
  await db.delete('favorites', `${source}:${comicId}`);
}

export async function isFavorite(source: string, comicId: string): Promise<boolean> {
  const db = await getDB();
  const fav = await db.get('favorites', `${source}:${comicId}`);
  return !!fav;
}

// ==================== 阅读进度 ====================
export async function getReadingProgress(source: string, comicId: string): Promise<ReadingProgress | undefined> {
  const db = await getDB();
  return db.get('readingProgress', `${source}:${comicId}`);
}

export async function getAllReadingProgress(): Promise<ReadingProgress[]> {
  const db = await getDB();
  return db.getAllFromIndex('readingProgress', 'by-lastRead');
}

export async function saveReadingProgress(progress: Omit<ReadingProgress, 'id' | 'lastReadAt'> & { cover?: string }): Promise<void> {
  const db = await getDB();
  const id = `${progress.source}:${progress.comicId}`;
  const existing = await db.get('readingProgress', id);
  await db.put('readingProgress', {
    ...existing,
    ...progress,
    id,
    lastReadAt: Date.now(),
  });
}

// ==================== 浏览历史 ====================
export async function getHistory(): Promise<BrowseHistory[]> {
  const db = await getDB();
  return db.getAllFromIndex('history', 'by-lastRead');
}

export async function addHistory(entry: Omit<BrowseHistory, 'id' | 'lastReadAt'>): Promise<void> {
  const db = await getDB();
  const id = `${entry.source}:${entry.comicId}:${entry.chapterUrl}`;
  await db.put('history', { ...entry, id, lastReadAt: Date.now() });
}

export async function removeHistory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('history', id);
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  await db.clear('history');
}
