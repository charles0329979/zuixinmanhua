// ============================================================
// source-platform/runtime/source-runtime.service.ts
// SourceRuntimeService — 唯一执行引擎 (V8)
//
// 职责:
//   1. 注册所有 ISourceDriver
//   2. 根据 sourceId 查找 driver
//   3. 统一执行 search / detail / chapters / images
//   4. 统一处理超时、并发、错误、日志
//
// 业务模块不得绕过此 Service 直接调 adapter 或 parser。
// Validation 也必须通过此 Service 执行。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { DriverRegistryService } from './driver-registry.service';
import { SearchExecutor } from '../execution/search.executor';
import { DetailExecutor } from '../execution/detail.executor';
import { ChaptersExecutor } from '../execution/chapters.executor';
import { ImagesExecutor } from '../execution/images.executor';
import { parseSearchHTML, parseDetailHTML, parseChaptersHTML, parseImagesHTML } from '../../sources/source-parser';
import type {
  ISourceDriver,
  SourceSearchInput, SourceSearchResult,
  SourceDetailInput, SourceComicDetail,
  SourceChaptersInput, SourceChapter,
  SourceImagesInput, SourceImage,
} from './source-driver.interface';

@Injectable()
export class SourceRuntimeService {
  private readonly logger = new Logger(SourceRuntimeService.name);

  constructor(
    private readonly registry: DriverRegistryService,
    private readonly searchExecutor: SearchExecutor,
    private readonly detailExecutor: DetailExecutor,
    private readonly chaptersExecutor: ChaptersExecutor,
    private readonly imagesExecutor: ImagesExecutor,
  ) {}

  // ============================================================
  // Driver 注册 (委托到 DriverRegistryService)
  // ============================================================

  register(driver: ISourceDriver): void { this.registry.register(driver); }
  registerAll(drivers: ISourceDriver[]): void { this.registry.registerAll(drivers); }
  unregister(sourceId: string): void { this.registry.unregister(sourceId); }
  getDriver(sourceId: string): ISourceDriver { return this.registry.get(sourceId); }
  getOptional(sourceId: string): ISourceDriver | undefined { return this.registry.getOptional(sourceId); }
  hasDriver(sourceId: string): boolean { return this.registry.has(sourceId); }
  listAll(): ISourceDriver[] { return this.registry.listAll(); }
  filterDrivers(fn: (d: ISourceDriver) => boolean): ISourceDriver[] { return this.registry.filter(fn); }

  // ============================================================
  // 统一执行入口 — 唯一允许执行 search/detail/chapters/images 的地方
  // ============================================================

  /** 单源搜索 */
  async search(sourceId: string, input: SourceSearchInput): Promise<SourceSearchResult[]> {
    const driver = this.getDriver(sourceId);
    this.logger.debug(`Runtime.search: ${sourceId} "${input.keyword}"`);
    return this.searchExecutor.execute(driver, input);
  }

  /** 多源并发搜索 */
  async searchAll(keyword: string, driverFilter?: (d: ISourceDriver) => boolean) {
    let targets = driverFilter ? this.filterDrivers(driverFilter) : this.listAll();
    this.logger.debug(`Runtime.searchAll: "${keyword}" → ${targets.length} drivers`);
    return this.searchExecutor.executeAll(targets, keyword);
  }

  /** 单源详情 */
  async detail(sourceId: string, input: SourceDetailInput): Promise<SourceComicDetail> {
    const driver = this.getDriver(sourceId);
    this.logger.debug(`Runtime.detail: ${sourceId}`);
    return this.detailExecutor.execute(driver, input);
  }

  /** 单源章节 */
  async chapters(sourceId: string, input: SourceChaptersInput): Promise<SourceChapter[]> {
    const driver = this.getDriver(sourceId);
    this.logger.debug(`Runtime.chapters: ${sourceId}`);
    return this.chaptersExecutor.execute(driver, input);
  }

  /** 单源图片 */
  async images(sourceId: string, input: SourceImagesInput): Promise<SourceImage[]> {
    const driver = this.getDriver(sourceId);
    this.logger.debug(`Runtime.images: ${sourceId}/${input.chapterId}`);
    return this.imagesExecutor.execute(driver, input);
  }

  // ============================================================
  // Client-mode HTML 解析 (纯 CSS 选择器解析，无网络)
  // ============================================================

  async parseSearch(sourceId: string, html: string): Promise<SourceSearchResult[]> {
    const driver = this.getDriver(sourceId);
    if (driver.type !== 'rule') {
      throw new Error(`Parse not supported for adapter driver: ${sourceId}`);
    }
    const source = (driver as any).source;
    if (!source) throw new Error(`Cannot access source definition for: ${sourceId}`);
    const results = parseSearchHTML(source, html);
    return results.map((r: any) => ({
      title: r.title, cover: r.cover, detailUrl: r.detailUrl,
      sourceId, sourceName: driver.sourceName,
      latestChapter: r.latestChapter, status: r.status,
    }));
  }

  async parseDetail(sourceId: string, html: string): Promise<SourceComicDetail> {
    const driver = this.getDriver(sourceId);
    if (driver.type !== 'rule') {
      throw new Error(`Parse not supported for adapter driver: ${sourceId}`);
    }
    const source = (driver as any).source;
    if (!source) throw new Error(`Cannot access source definition for: ${sourceId}`);
    const d = parseDetailHTML(source, html);
    return {
      comicId: '', title: d.title || '', author: d.author || '',
      cover: d.cover || '', status: d.status || 'ongoing', description: d.description || '',
      source: sourceId,
    };
  }

  async parseChapters(sourceId: string, html: string): Promise<SourceChapter[]> {
    const driver = this.getDriver(sourceId);
    if (driver.type !== 'rule') {
      throw new Error(`Parse not supported for adapter driver: ${sourceId}`);
    }
    const source = (driver as any).source;
    if (!source) throw new Error(`Cannot access source definition for: ${sourceId}`);
    const chs = parseChaptersHTML(source, html);
    return chs.map((c: any, i: number) => ({
      chapterId: encodeURIComponent(c.url), title: c.title, url: c.url, index: i,
    }));
  }

  async parseImages(sourceId: string, html: string): Promise<SourceImage[]> {
    const driver = this.getDriver(sourceId);
    if (driver.type !== 'rule') {
      throw new Error(`Parse not supported for adapter driver: ${sourceId}`);
    }
    const source = (driver as any).source;
    if (!source) throw new Error(`Cannot access source definition for: ${sourceId}`);
    const urls = parseImagesHTML(source, html);
    return urls.map((url: string) => ({ url }));
  }
}
