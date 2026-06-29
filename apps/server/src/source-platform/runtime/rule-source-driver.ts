// ============================================================
// source-platform/runtime/rule-source-driver.ts
// ★ LEGACY BRIDGE — 将旧 source-parser 函数包装为 ISourceDriver
//
// 此文件是旧 CSS 选择器引擎与 source-platform 之间的桥接层。
// 外部不得直接 import source-parser 函数。
// 构造由 legacy-bridge/LegacyRuleParserWrapperService 负责。
// ============================================================

import type {
  ISourceDriver,
  SourceSearchInput, SourceSearchResult,
  SourceDetailInput, SourceComicDetail,
  SourceChaptersInput, SourceChapter,
  SourceImagesInput, SourceImage,
} from './source-driver.interface';
import type { MangaSource } from '../../sources/source-store';
import { searchBySource, getDetailBySource, getChaptersBySource, getImagesBySource } from '../../sources/source-parser';

export class RuleSourceDriver implements ISourceDriver {
  readonly type = 'rule' as const;

  constructor(private readonly _source: MangaSource) {}

  /** 原始 MangaSource 定义 (供 SourceRuntimeService parse 方法使用) */
  get source(): MangaSource { return this._source; }

  get sourceId(): string { return this._source.id; }
  get sourceName(): string { return this._source.name; }

  /** @deprecated V6 compat */
  get id(): string { return this.sourceId; }
  /** @deprecated V6 compat */
  get name(): string { return this.sourceName; }
  /** @deprecated V6 compat */
  get host(): string { return this.source.host; }

  /** JS 规则 (manwa AES 解密等) — 供 ProxyService 通过 DriverRegistry 获取 */
  get jsRules(): any { return (this.source as any).jsRules; }

  async search(input: SourceSearchInput): Promise<SourceSearchResult[]> {
    const results = await searchBySource(this.source, input.keyword);
    return results.map(r => ({
      title: r.title, cover: r.cover, detailUrl: r.detailUrl,
      sourceId: r.sourceId || this.sourceId, sourceName: r.sourceName || this.sourceName,
      latestChapter: r.latestChapter, status: r.status,
    }));
  }

  async detail(input: SourceDetailInput): Promise<SourceComicDetail> {
    const d = await getDetailBySource(this.source, input.comicId);
    return {
      comicId: input.comicId, title: d.title || '', author: d.author || '',
      cover: d.cover || '', status: d.status || 'ongoing', description: d.description || '',
      source: this.sourceId,
    };
  }

  async chapters(input: SourceChaptersInput): Promise<SourceChapter[]> {
    const chs = await getChaptersBySource(this.source, input.comicId);
    return chs.map((c, i) => ({
      chapterId: encodeURIComponent(c.url), title: c.title, url: c.url, index: i,
    }));
  }

  async images(input: SourceImagesInput): Promise<SourceImage[]> {
    const urls = await getImagesBySource(this.source, input.chapterId);
    return urls.map(url => ({ url }));
  }
}
