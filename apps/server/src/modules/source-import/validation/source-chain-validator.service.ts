// ============================================================
// apps/server/src/modules/source-import/validation/source-chain-validator.service.ts
// SourceChainValidator — 全链路验证: static → search → detail → chapters → images → proxy
//
// ★ V7: 全部执行通过 SourceRuntimeService (唯一执行入口)。
// 不再直接调用 source-parser 函数。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { SourceValidationResult, SearchCheckDetail, ChainCheckDetail } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import { SourceStaticLintService } from './source-static-validator.service';
import { SourceRuntimeService } from '../../../source-platform/runtime/source-runtime.service';
import { DriverRegistryService } from '../../../source-platform/runtime/driver-registry.service';
import { RuleSourceDriver } from '../../../source-platform/runtime/rule-source-driver';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

/** 测试关键词池 — 中/英/日常见漫画名称 */
const TEST_KEYWORDS = ['海贼王', '火影忍者', '一拳超人', '斗罗大陆'];

/** 各步骤默认超时 (ms) */
const STEP_TIMEOUT_MS = 15000;

@Injectable()
export class SourceChainValidatorService {
  private readonly logger = new Logger(SourceChainValidatorService.name);

  constructor(
    private readonly staticLint: SourceStaticLintService,
    private readonly runtime: SourceRuntimeService,
    private readonly driverRegistry: DriverRegistryService,
  ) {}

  /**
   * 全链路验证 — 单入口
   *
   * ★ 所有执行通过 SourceRuntimeService (唯一执行入口)。
   * 创建临时 RuleSourceDriver 注册到 runtime，验证完成后清理。
   */
  async validate(source: MangaSource): Promise<SourceValidationResult> {
    const testedAt = new Date().toISOString();
    const startTime = Date.now();

    const result: SourceValidationResult = {
      staticPassed: false, networkPassed: false, searchPassed: false,
      detailPassed: false, chaptersPassed: false, imagesPassed: false, proxyPassed: false,
      testedAt,
    };

    // ====== Step 0: Static Lint ======
    const staticResult = this.staticLint.lint(source);
    result.staticPassed = staticResult.passed;
    if (!staticResult.passed) {
      result.errorCode = 'STATIC_FAILED';
      result.errorMessage = staticResult.detail.checks.filter(c => !c.passed).map(c => c.message).join('; ');
      result.latencyMs = Date.now() - startTime;
      result.layerDetails = { static: staticResult.detail };
      return result;
    }

    // ★ 注册临时 driver 到 runtime (验证用)
    const driver = new RuleSourceDriver(source);
    const tempId = `__validate_${source.id}_${Date.now()}`;
    // 覆写 sourceId 避免与已有 driver 冲突
    (driver as any)._source = source;
    this.driverRegistry.register(driver);

    try {
      // ====== Step 1: Search (通过 SourceRuntime) ======
      const searchDetail = await this.trySearch(driver.sourceId);
      result.searchPassed = searchDetail.passed;
      result.testKeyword = searchDetail.keyword;
      result.resultCount = searchDetail.resultsPerKeyword?.[searchDetail.keyword!] || 0;
      result.firstComicTitle = searchDetail.firstTitle;
      if (searchDetail.passed) result.networkPassed = true;

      if (!searchDetail.passed) {
        result.errorCode = 'SEARCH_FAILED';
        result.errorMessage = searchDetail.error || 'No results for any keyword';
        result.latencyMs = Date.now() - startTime;
        result.layerDetails = { static: staticResult.detail, search: searchDetail };
        return result;
      }

      // ====== Step 2: Detail → Chapters → Images → Proxy ======
      const chainDetail = await this.tryFullChain(driver.sourceId, searchDetail.firstUrl!, source);
      result.detailPassed = chainDetail.detailOk;
      result.chaptersPassed = chainDetail.chaptersOk;
      result.imagesPassed = chainDetail.imagesOk;
      result.proxyPassed = chainDetail.proxyOk;
      result.firstChapterTitle = chainDetail.firstChapterTitle;
      result.firstImageUrl = chainDetail.firstImageUrl;

      if (!chainDetail.allPassed) {
        result.errorCode = chainDetail.errorCode || 'CHAIN_FAILED';
        result.errorMessage = chainDetail.error || 'Full chain validation failed';
      }

      result.latencyMs = Date.now() - startTime;
      result.layerDetails = {
        static: staticResult.detail,
        search: searchDetail,
        chain: chainDetail,
      };

      return result;
    } finally {
      // 清理临时 driver
      try { this.driverRegistry.unregister(driver.sourceId); } catch {}
    }
  }

  // ============================================================
  // Search: try keywords sequentially (通过 SourceRuntime)
  // ============================================================

  private async trySearch(driverId: string): Promise<SearchCheckDetail & { passed: boolean; keyword?: string; firstTitle?: string; firstUrl?: string; error?: string }> {
    const detail: SearchCheckDetail = { keywords: TEST_KEYWORDS, resultsPerKeyword: {}, totalMs: 0 };
    const t0 = Date.now();

    for (const kw of TEST_KEYWORDS) {
      try {
        const results = await Promise.race([
          this.runtime.search(driverId, { keyword: kw }),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
        ]);

        detail.resultsPerKeyword[kw] = results?.length || 0;

        if (results && results.length > 0) {
          const first = results[0];
          if (first.title && first.detailUrl) {
            detail.firstResultTitle = first.title;
            detail.firstResultUrl = first.detailUrl;
            detail.totalMs = Date.now() - t0;
            this.logger.log(`Chain[${driverId}] Search OK: "${kw}" → ${results.length} results, "${first.title?.slice(0, 30)}"`);
            return { ...detail, passed: true, keyword: kw, firstTitle: first.title, firstUrl: first.detailUrl };
          }
        }
      } catch (e: any) {
        detail.resultsPerKeyword[kw] = -1;
        this.logger.debug(`Chain[${driverId}] Search "${kw}" failed: ${e.message?.slice(0, 80)}`);
      }
    }

    detail.totalMs = Date.now() - t0;
    return { ...detail, passed: false, error: `All ${TEST_KEYWORDS.length} keywords returned 0 valid results` };
  }

  // ============================================================
  // Full chain: detail → chapters → images → proxy (通过 SourceRuntime)
  // ============================================================

  private async tryFullChain(driverId: string, comicUrl: string, source: MangaSource): Promise<ChainCheckDetail & { allPassed: boolean; detailOk: boolean; chaptersOk: boolean; imagesOk: boolean; proxyOk: boolean; errorCode?: string; error?: string }> {
    const detail: ChainCheckDetail = { detailUrl: comicUrl, detailTitleMatch: false, chapterCount: 0, imageCount: 0, totalMs: 0 };
    const t0 = Date.now();

    // Step 2a: Detail (通过 SourceRuntime)
    try {
      const d = await Promise.race([
        this.runtime.detail(driverId, { comicId: comicUrl }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
      ]);
      detail.detailTitleMatch = !!(d && d.title);
    } catch (e: any) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: false, chaptersOk: false, imagesOk: false, proxyOk: false, errorCode: 'DETAIL_FAILED', error: `Detail failed: ${e.message}` };
    }

    // Step 2b: Chapters (通过 SourceRuntime)
    let chapters: { chapterId: string; title: string; url: string; index: number }[] = [];
    try {
      chapters = await Promise.race([
        this.runtime.chapters(driverId, { comicId: comicUrl }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
      ]);
    } catch (e: any) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: false, imagesOk: false, proxyOk: false, errorCode: 'CHAPTERS_FAILED', error: `Chapters failed: ${e.message}` };
    }

    detail.chapterCount = chapters?.length || 0;
    if (!chapters || chapters.length === 0) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: false, imagesOk: false, proxyOk: false, errorCode: 'CHAPTERS_EMPTY', error: 'Chapter list is empty' };
    }

    // Use last chapter
    const testChapter = chapters[chapters.length - 1];
    detail.firstChapterTitle = testChapter.title;

    // Step 2c: Images (通过 SourceRuntime)
    let images: { url: string }[] = [];
    try {
      images = await Promise.race([
        this.runtime.images(driverId, { comicId: comicUrl, chapterId: testChapter.chapterId || testChapter.url }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
      ]);
    } catch (e: any) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: true, imagesOk: false, proxyOk: false, errorCode: 'IMAGES_FAILED', error: `Images failed: ${e.message}` };
    }

    detail.imageCount = images?.length || 0;
    if (!images || images.length === 0) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: true, imagesOk: false, proxyOk: false, errorCode: 'IMAGES_EMPTY', error: 'Image list is empty' };
    }

    // Step 2d: Proxy image check
    const firstImage = images[0].url;
    detail.firstImageUrl = firstImage;
    const ct = await this.checkImageLoadable(firstImage, source);
    detail.proxyImageStatus = ct.statusCode;
    detail.proxyImageContentType = ct.contentType;

    detail.totalMs = Date.now() - t0;

    if (!ct.isImage) {
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: true, imagesOk: true, proxyOk: false, errorCode: 'PROXY_FAILED', error: `Image not loadable: HTTP ${ct.statusCode} ${ct.contentType || ''}` };
    }

    return { ...detail, allPassed: true, detailOk: true, chaptersOk: true, imagesOk: true, proxyOk: true };
  }

  // ============================================================
  // Proxy image check
  // ============================================================

  private checkImageLoadable(url: string, source: MangaSource): Promise<{ isImage: boolean; statusCode?: number; contentType?: string }> {
    return new Promise(resolve => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.request(url, {
          method: 'GET',
          timeout: STEP_TIMEOUT_MS,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
            'Accept': 'image/*,*/*',
            'Referer': source.host.endsWith('/') ? source.host : source.host + '/',
          },
          rejectUnauthorized: (source as any).allowInsecureSSL || false,
        }, (res) => {
          const ct = (res.headers['content-type'] || '').toLowerCase();
          const isImage = ct.startsWith('image/');
          res.destroy();
          resolve({ isImage, statusCode: res.statusCode || 0, contentType: ct });
        });
        req.on('error', (e: any) => resolve({ isImage: false, statusCode: 0, contentType: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ isImage: false, statusCode: 0, contentType: 'timeout' }); });
        req.end();
      } catch (e: any) {
        resolve({ isImage: false, statusCode: 0, contentType: e.message });
      }
    });
  }
}
