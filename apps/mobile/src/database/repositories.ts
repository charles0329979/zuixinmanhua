// ============================================================
// apps/mobile/src/database/repositories.ts
// 数据仓库 — 封装 expo-sqlite 操作
// ============================================================

import * as SQLite from 'expo-sqlite';
import { getDatabase } from './index';

// ---- Favorites ----

export interface FavoriteRow {
  id: string; comic_id: string; title: string; author: string | null;
  cover: string | null; source: string; last_chapter: string | null;
  status: string; added_at: number;
}

export async function getAllFavorites(
  sortBy: 'added' | 'title' = 'added',
): Promise<FavoriteRow[]> {
  const db = await getDatabase();
  const order = sortBy === 'added' ? 'added_at DESC' : 'title ASC';
  return db.getAllAsync<FavoriteRow>(
    `SELECT * FROM favorites ORDER BY ${order}`,
  );
}

export async function addFavorite(
  item: Omit<FavoriteRow, 'id' | 'added_at'> & { added_at?: number },
): Promise<void> {
  const db = await getDatabase();
  const id = `${item.source}:${item.comic_id}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO favorites
     (id, comic_id, title, author, cover, source, last_chapter, status, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, item.comic_id, item.title, item.author, item.cover,
     item.source, item.last_chapter, item.status || 'ongoing',
     item.added_at || Date.now()],
  );
}

export async function removeFavorite(source: string, comicId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM favorites WHERE id = ?', [`${source}:${comicId}`]);
}

// ---- Reading Progress ----

export interface ProgressRow {
  id: string; comic_id: string; comic_title: string; source: string;
  chapter_id: string; chapter_title: string | null;
  page_index: number; cover: string | null; last_read_at: number;
}

export async function getAllProgress(): Promise<ProgressRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProgressRow>(
    'SELECT * FROM reading_progress ORDER BY last_read_at DESC',
  );
}

export async function upsertProgress(item: {
  comicId: string; comicTitle: string; source: string;
  chapterId: string; chapterTitle?: string; pageIndex: number; cover?: string;
}): Promise<void> {
  const db = await getDatabase();
  const id = `${item.source}:${item.comicId}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO reading_progress
     (id, comic_id, comic_title, source, chapter_id, chapter_title, page_index, cover, last_read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, item.comicId, item.comicTitle, item.source,
     item.chapterId, item.chapterTitle || null, item.pageIndex,
     item.cover || null, Date.now()],
  );
}

// ---- History ----

export interface HistoryRow {
  id: string; comic_id: string; title: string; source: string;
  cover: string | null; chapter_title: string | null;
  chapter_url: string | null; page_index: number; last_read_at: number;
}

export async function getAllHistory(limit = 100): Promise<HistoryRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<HistoryRow>(
    'SELECT * FROM browse_history ORDER BY last_read_at DESC LIMIT ?',
    [limit],
  );
}

export async function addHistory(item: {
  comicId: string; title: string; source: string; cover?: string;
  chapterTitle?: string; chapterUrl?: string; pageIndex?: number;
}): Promise<void> {
  const db = await getDatabase();
  const id = `${item.source}:${item.comicId}:${Date.now()}`;
  await db.runAsync(
    `INSERT INTO browse_history
     (id, comic_id, title, source, cover, chapter_title, chapter_url, page_index, last_read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, item.comicId, item.title, item.source, item.cover || null,
     item.chapterTitle || null, item.chapterUrl || null,
     item.pageIndex || 0, Date.now()],
  );
}

// ---- Settings ----

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [key],
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value],
  );
}
