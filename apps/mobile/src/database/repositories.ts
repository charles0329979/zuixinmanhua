// ============================================================
// apps/mobile/src/database/repositories.ts
// SQLite repository stubs — all throw, triggering Zustand fallback
// TODO: re-enable when Node/expo-sqlite ESM/CJS resolution is fixed
// ============================================================

const UNSUPPORTED = 'SQLite unavailable (Node v24). Data stored in memory only.';

export interface FavoriteRow { id: string; comic_id: string; title: string; author: string | null; cover: string | null; source: string; last_chapter: string | null; status: string; added_at: number; }
export interface ProgressRow { id: string; comic_id: string; comic_title: string; source: string; chapter_id: string; chapter_title: string | null; page_index: number; cover: string | null; last_read_at: number; }
export interface HistoryRow { id: string; comic_id: string; title: string; source: string; cover: string | null; chapter_title: string | null; chapter_url: string | null; page_index: number; last_read_at: number; }

export async function getAllFavorites(): Promise<FavoriteRow[]> { console.warn('[DB]', UNSUPPORTED); return []; }
export async function addFavorite(): Promise<void> { console.warn('[DB]', UNSUPPORTED); }
export async function removeFavorite(): Promise<void> { console.warn('[DB]', UNSUPPORTED); }
export async function getAllProgress(): Promise<ProgressRow[]> { console.warn('[DB]', UNSUPPORTED); return []; }
export async function upsertProgress(): Promise<void> { console.warn('[DB]', UNSUPPORTED); }
export async function getAllHistory(): Promise<HistoryRow[]> { console.warn('[DB]', UNSUPPORTED); return []; }
export async function addHistory(): Promise<void> { console.warn('[DB]', UNSUPPORTED); }
export async function getSetting(): Promise<string | null> { return null; }
export async function setSetting(): Promise<void> {}
