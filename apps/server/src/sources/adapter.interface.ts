// 书源适配器接口 — 每个书源实现此接口即可接入
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

export interface SourceAdapter {
  id: string;
  name: string;
  domain: string;

  search(query: string): Promise<ComicInfo[]>;
  getComicDetail(comicId: string): Promise<ComicInfo>;
  getChapters(comicId: string): Promise<ChapterInfo[]>;
  getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail>;
}
