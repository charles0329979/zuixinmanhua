// ============================================================
// source-platform/runtime/adapter-source-driver.ts
// ★ LEGACY BRIDGE — 将旧 SourceAdapter 包装为 ISourceDriver
//
// 此文件是旧系统与 source-platform 之间的桥接层。
// 外部不得直接 import 旧 adapter 接口。
// 构造由 legacy-bridge/LegacyAdapterLoaderService 负责。
// ============================================================

import type {
  ISourceDriver,
  SourceSearchInput, SourceSearchResult,
  SourceDetailInput, SourceComicDetail,
  SourceChaptersInput, SourceChapter,
  SourceImagesInput, SourceImage,
} from './source-driver.interface';
import type { SourceAdapter } from '../../sources/adapter.interface';

export class AdapterSourceDriver implements ISourceDriver {
  readonly type = 'adapter' as const;

  constructor(private readonly adapter: SourceAdapter) {}

  get sourceId(): string { return this.adapter.id; }
  get sourceName(): string { return this.adapter.name; }

  /** @deprecated V6 compat */
  get id(): string { return this.sourceId; }
  /** @deprecated V6 compat */
  get name(): string { return this.sourceName; }
  /** @deprecated V6 compat */
  get host(): string { return this.adapter.domain; }

  async search(input: SourceSearchInput): Promise<SourceSearchResult[]> {
    const results = await this.adapter.search(input.keyword);
    return results.map(r => ({
      title: r.title, cover: r.cover, detailUrl: r.comicId,
      sourceId: this.sourceId, sourceName: this.sourceName,
      latestChapter: r.lastChapter, status: r.status, author: r.author,
    }));
  }

  async detail(input: SourceDetailInput): Promise<SourceComicDetail> {
    const d = await this.adapter.getComicDetail(input.comicId);
    return { comicId: d.comicId, title: d.title, author: d.author, cover: d.cover, status: d.status, description: d.description, lastChapter: d.lastChapter, updatedAt: d.updatedAt, source: d.source, tags: d.tags };
  }

  async chapters(input: SourceChaptersInput): Promise<SourceChapter[]> {
    return this.adapter.getChapters(input.comicId);
  }

  async images(input: SourceImagesInput): Promise<SourceImage[]> {
    const detail = await this.adapter.getChapterImages(input.comicId, input.chapterId);
    return (detail.images || []).map(url => ({ url }));
  }
}
