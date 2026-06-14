// ============================================================
// packages/types/src/adapter.ts
// 书源适配器核心接口 — 平台无关
// ============================================================

/** 漫画基本信息 */
export interface ComicInfo {
  comicId: string;
  title: string;
  author: string;
  cover: string;
  status: ComicStatus;
  description: string;
  lastChapter: string;
  updatedAt: string;
  source: string;
  tags?: string[];
}

export type ComicStatus = 'ongoing' | 'completed' | 'hiatus';

/** 章节列表项 */
export interface ChapterInfo {
  chapterId: string;
  title: string;
  url: string;
  index: number;
}

/** 章节详情（含图片 URL 列表） */
export interface ChapterDetail {
  chapterId: string;
  comicTitle: string;
  chapterTitle: string;
  images: string[];
  cover?: string;
  author?: string;
  prevChapter?: { chapterId: string; title: string };
  nextChapter?: { chapterId: string; title: string };
}

/** 注入适配器的运行时上下文 */
export interface AdapterContext {
  baseUrl: string;
  timeout: number;
  userAgent: string;
  retries: number;
  headers?: Record<string, string>;
  /** 可选的域名切换器（server端用） */
  domainResolver?: {
    switchToNextDomain(sourceId: string): Promise<string>;
  };
}

/** ★ 所有书源适配器必须实现的接口 ★ */
export interface ISourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly testTargets: { comicId?: string; chapterId?: string };

  search(query: string): Promise<ComicInfo[]>;
  getComicDetail(comicId: string): Promise<ComicInfo>;
  getChapters(comicId: string): Promise<ChapterInfo[]>;
  getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail>;
}
