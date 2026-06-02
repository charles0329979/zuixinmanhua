// ============================================================
// 前端类型定义
// ============================================================

export interface ComicInfo {
  comicId: string;
  title: string;
  author: string;
  cover: string;
  status: 'ongoing' | 'completed' | 'hiatus';
  description: string;
  lastChapter: string;
  updatedAt: string;
  source: string;
  sourceName?: string;
  tags?: string[];
}

export interface ChapterInfo {
  chapterId: string;
  title: string;
  url: string;
  index: number;
}

export interface ChapterDetail {
  chapterId: string;
  comicTitle: string;
  chapterTitle: string;
  images: string[];
  prevChapter?: { chapterId: string; title: string };
  nextChapter?: { chapterId: string; title: string };
}

export interface SourceSearchResult {
  source: string;
  sourceName: string;
  results: ComicInfo[];
  error?: string;
}

export interface SearchResponse {
  query: string;
  sources: SourceSearchResult[];
}

export interface FavoriteComic {
  id: string;
  comicId: string;
  title: string;
  author?: string;
  cover?: string;
  source: string;
  lastChapter?: string;
  addedAt: number;
}

export interface ReadingProgress {
  id: string;
  comicId: string;
  comicTitle: string;
  source: string;
  chapterId: string;
  chapterTitle: string;
  chapterUrl: string;
  pageIndex: number;
  cover?: string;
  lastReadAt: number;
}

export interface BrowseHistory {
  id: string;
  comicId: string;
  title: string;
  source: string;
  comicUrl: string;
  cover?: string;
  chapterTitle: string;
  chapterUrl: string;
  pageIndex: number;
  lastReadAt: number;
}

export interface SourceStatus {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
}
