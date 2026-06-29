// ============================================================
// source-platform/runtime/source-driver.interface.ts
// ISourceDriver — 统一书源执行接口 (V7)
//
// adapter（硬编码类）和 rule（CSS 选择器）都实现此接口。
// SourceRuntimeService 只依赖此接口，不知道底层实现。
// ============================================================

// ============================================================
// Input types — 所有方法接受结构化 input 对象
// ============================================================

export interface SourceSearchInput {
  /** 搜索关键词 */
  keyword: string;
}

export interface SourceDetailInput {
  /** adapter 用 comicId，rule 用 detailUrl */
  comicId: string;
}

export interface SourceChaptersInput {
  /** adapter 用 comicId，rule 用 detailUrl */
  comicId: string;
}

export interface SourceImagesInput {
  /** adapter 用 comicId */
  comicId: string;
  /** adapter 用 chapterId，rule 用 chapterUrl */
  chapterId: string;
}

// ============================================================
// Output types
// ============================================================

export interface SourceSearchResult {
  title: string;
  cover: string;
  detailUrl: string;
  sourceId: string;
  sourceName: string;
  latestChapter?: string;
  status?: string;
  author?: string;
}

export interface SourceComicDetail {
  comicId: string;
  title: string;
  author: string;
  cover: string;
  status: string;
  description: string;
  lastChapter?: string;
  updatedAt?: string;
  source: string;
  tags?: string[];
}

export interface SourceChapter {
  chapterId: string;
  title: string;
  url: string;
  index: number;
}

export interface SourceImage {
  url: string;
}

// ============================================================
// ISourceDriver — 统一书源驱动接口
// ============================================================

export interface ISourceDriver {
  /** 唯一标识，如 "baozi"、"manwa"、"yydsmh" */
  readonly sourceId: string;

  /** 人类可读名称，如 "包子漫画" */
  readonly sourceName: string;

  /** 驱动类型 */
  readonly type: 'adapter' | 'rule';

  /** 搜索漫画 */
  search(input: SourceSearchInput): Promise<SourceSearchResult[]>;

  /** 获取漫画详情 */
  detail(input: SourceDetailInput): Promise<SourceComicDetail>;

  /** 获取章节列表 */
  chapters(input: SourceChaptersInput): Promise<SourceChapter[]>;

  /** 获取章节图片 */
  images(input: SourceImagesInput): Promise<SourceImage[]>;
}

// ============================================================
// 向后兼容别名 (V6→V7 迁移期间)
// ============================================================

/** @deprecated use SourceSearchResult */
export type ComicResult = SourceSearchResult;
/** @deprecated use SourceComicDetail */
export type ComicDetail = SourceComicDetail;
/** @deprecated use SourceChapter */
export type ChapterInfo = SourceChapter;
/** @deprecated use SourceImage */
export type ChapterDetail = { chapterId: string; comicTitle: string; chapterTitle: string; images: string[] };
