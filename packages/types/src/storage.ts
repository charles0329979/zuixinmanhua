// ============================================================
// packages/types/src/storage.ts
// 本地数据库实体类型 — 收藏、进度、历史、设置
// ============================================================

/** 收藏的漫画 */
export interface FavoriteComic {
  id: string; // "source:comicId"
  comicId: string;
  title: string;
  author?: string;
  cover?: string;
  source: string;
  lastChapter?: string;
  status: string;
  addedAt: number; // Unix timestamp ms
  createdAt?: string;
  updatedAt?: string;
}

/** 阅读进度 */
export interface ReadingProgress {
  id: string; // "source:comicId"
  comicId: string;
  comicTitle: string;
  source: string;
  chapterId: string;
  chapterTitle?: string;
  pageIndex: number;
  cover?: string;
  lastReadAt: number; // Unix timestamp ms
  createdAt?: string;
  updatedAt?: string;
}

/** 浏览历史 */
export interface BrowseHistoryItem {
  id: string;
  comicId: string;
  title: string;
  source: string;
  cover?: string;
  chapterTitle?: string;
  chapterUrl?: string;
  pageIndex: number;
  lastReadAt: number; // Unix timestamp ms
  createdAt?: string;
}

/** 应用设置 (key-value) */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  brightness: number; // 0-100
  defaultSourceFilter: string[];
  imageCacheMaxMb: number;
  readerMode: 'long-strip' | 'paged';
  autoNextChapter: boolean;
}
