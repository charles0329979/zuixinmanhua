// ============================================================
// source-platform/source-platform.service.ts
// SourcePlatformService — 唯一对外门面 (V8)
//
// 所有业务模块通过此 Service 访问书源。
// 内部委托到 SourceRuntimeService (唯一执行入口)。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { SourceRuntimeService } from './runtime/source-runtime.service';
import { SourcePromotionService } from './release/source-promotion.service';
import type { SourceSearchResult, SourceComicDetail, SourceChapter, SourceImage } from './runtime/source-driver.interface';

@Injectable()
export class SourcePlatformService {
  private readonly logger = new Logger(SourcePlatformService.name);

  constructor(
    private readonly runtime: SourceRuntimeService,
    private readonly promotion: SourcePromotionService,
  ) {}

  // ============================================================
  // 搜索
  // ============================================================

  async search(keyword: string): Promise<{
    sources: { sourceId: string; sourceName: string; sourceType: string; results: SourceSearchResult[]; error?: string }[];
  }> {
    const stableIds = new Set(this.promotion.getStableIds());
    const raw = await this.runtime.searchAll(keyword, d => stableIds.has(d.sourceId));

    const sources = raw.map(r => ({
      sourceId: r.driverId, sourceName: r.driverName, sourceType: 'source',
      results: r.results, error: r.error,
    }));
    return { sources };
  }

  async searchOne(sourceId: string, keyword: string): Promise<SourceSearchResult[]> {
    return this.runtime.search(sourceId, { keyword });
  }

  // ============================================================
  // 详情 / 章节 / 图片 — 全部走 SourceRuntimeService
  // ============================================================

  async getDetail(sourceId: string, comicId: string): Promise<SourceComicDetail> {
    return this.runtime.detail(sourceId, { comicId });
  }

  async getChapters(sourceId: string, comicId: string): Promise<SourceChapter[]> {
    return this.runtime.chapters(sourceId, { comicId });
  }

  async getImages(sourceId: string, comicId: string, chapterId: string): Promise<SourceImage[]> {
    return this.runtime.images(sourceId, { comicId, chapterId });
  }

  // ============================================================
  // Client-mode HTML 解析 (委托给 RuleSourceDriver 的底层 parser)
  // ============================================================

  async parseSearch(sourceId: string, html: string): Promise<SourceSearchResult[]> {
    return this.runtime.parseSearch(sourceId, html);
  }

  async parseDetail(sourceId: string, html: string): Promise<SourceComicDetail> {
    return this.runtime.parseDetail(sourceId, html);
  }

  async parseChapters(sourceId: string, html: string): Promise<SourceChapter[]> {
    return this.runtime.parseChapters(sourceId, html);
  }

  async parseImages(sourceId: string, html: string): Promise<SourceImage[]> {
    return this.runtime.parseImages(sourceId, html);
  }

  // ============================================================
  // 查询
  // ============================================================

  listSources(): { id: string; name: string }[] {
    return this.runtime.listAll().map(d => ({ id: d.sourceId, name: d.sourceName }));
  }
}
