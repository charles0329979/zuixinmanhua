// ============================================================
// apps/server/src/modules/source-import/validation/source-chain-validator.service.ts
// SourceChainValidator — 全链路验证: static → search → detail → chapters → images → proxy
//
// 一个源只有完成完整链路，才能视为真正可用。
// 输出 SourceValidationResult。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { SourceValidationResult, SearchCheckDetail, ChainCheckDetail } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import type { AggregatedComicResult } from '../../../sources/source-parser';
import {
  searchBySource, getDetailBySource, getChaptersBySource, getImagesBySource,
} from '../../../sources/source-parser';
import { SourceStaticLintService } from './source-static-validator.service';
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

  constructor(private readonly staticLint: SourceStaticLintService) {}

  /**
   * 全链路验证 — 单入口
   *
   * 流程:
   *   1. 静态检查 (规则完整性)
   *   2. 尝试关键词池中的每个词进行搜索
   *   3. 取第一个有效结果 → 详情解析
   *   4. 取第一个/最后一个章节 → 图片解析
   *   5. 取第一张图片 → proxy 加载验证
   *
   * 每步记录耗时和失败原因，绝不崩溃。
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

    // ====== Step 1: Search ======
    const searchDetail = await this.trySearch(source);
    result.searchPassed = searchDetail.passed;
    result.testKeyword = searchDetail.keyword;
    result.resultCount = searchDetail.resultsPerKeyword?.[searchDetail.keyword!] || 0;
    result.firstComicTitle = searchDetail.firstTitle;

    if (!searchDetail.passed) {
      result.errorCode = 'SEARCH_FAILED';
      result.errorMessage = searchDetail.error || 'No results for any keyword';
      result.latencyMs = Date.now() - startTime;
      result.layerDetails = { static: staticResult.detail, search: searchDetail };
      return result;
    }

    // ====== Step 2: Detail → Chapters → Images → Proxy ======
    const chainDetail = await this.tryFullChain(source, searchDetail.firstUrl!, searchDetail.keyword!);
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
  }

  // ============================================================
  // Search: try keywords sequentially
  // ============================================================

  private async trySearch(source: MangaSource): Promise<SearchCheckDetail & { passed: boolean; keyword?: string; firstTitle?: string; firstUrl?: string; error?: string }> {
    const detail: SearchCheckDetail = { keywords: TEST_KEYWORDS, resultsPerKeyword: {}, totalMs: 0 };
    const t0 = Date.now();

    for (const kw of TEST_KEYWORDS) {
      try {
        const results = await Promise.race([
          searchBySource(source, kw),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
        ]) as AggregatedComicResult[];

        detail.resultsPerKeyword[kw] = results?.length || 0;

        if (results && results.length > 0) {
          const first = results[0];
          if (first.title && first.detailUrl) {
            detail.firstResultTitle = first.title;
            detail.firstResultUrl = first.detailUrl;
            detail.totalMs = Date.now() - t0;
            this.logger.log(`Chain[${source.id}] Search OK: "${kw}" → ${results.length} results, "${first.title?.slice(0, 30)}"`);
            return { ...detail, passed: true, keyword: kw, firstTitle: first.title, firstUrl: first.detailUrl };
          }
        }
      } catch (e: any) {
        detail.resultsPerKeyword[kw] = -1;
        this.logger.debug(`Chain[${source.id}] Search "${kw}" failed: ${e.message?.slice(0, 80)}`);
      }
    }

    detail.totalMs = Date.now() - t0;
    return { ...detail, passed: false, error: `All ${TEST_KEYWORDS.length} keywords returned 0 valid results` };
  }

  // ============================================================
  // Full chain: detail → chapters → images → proxy
  // ============================================================

  private async tryFullChain(source: MangaSource, comicUrl: string, keyword: string): Promise<ChainCheckDetail & { allPassed: boolean; detailOk: boolean; chaptersOk: boolean; imagesOk: boolean; proxyOk: boolean; errorCode?: string; error?: string }> {
    const detail: ChainCheckDetail = { detailUrl: comicUrl, detailTitleMatch: false, chapterCount: 0, imageCount: 0, totalMs: 0 };
    const t0 = Date.now();

    // Step 2a: Detail
    try {
      const d = await Promise.race([
        getDetailBySource(source, comicUrl),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
      ]) as Record<string, string>;
      detail.detailTitleMatch = !!(d && d.title);
    } catch (e: any) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: false, chaptersOk: false, imagesOk: false, proxyOk: false, errorCode: 'DETAIL_FAILED', error: `Detail failed: ${e.message}` };
    }

    // Step 2b: Chapters
    let chapters: { title: string; url: string }[] = [];
    try {
      chapters = await Promise.race([
        getChaptersBySource(source, comicUrl),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
      ]) as { title: string; url: string }[];
    } catch (e: any) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: false, imagesOk: false, proxyOk: false, errorCode: 'CHAPTERS_FAILED', error: `Chapters failed: ${e.message}` };
    }

    detail.chapterCount = chapters?.length || 0;
    if (!chapters || chapters.length === 0) {
      detail.totalMs = Date.now() - t0;
      return { ...detail, allPassed: false, detailOk: true, chaptersOk: false, imagesOk: false, proxyOk: false, errorCode: 'CHAPTERS_EMPTY', error: 'Chapter list is empty' };
    }

    // Use last chapter (通常是最新)
    const testChapter = chapters[chapters.length - 1];
    detail.firstChapterTitle = testChapter.title;

    // Step 2c: Images
    let images: string[] = [];
    try {
      images = await Promise.race([
        getImagesBySource(source, testChapter.url),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('TIMEOUT')), STEP_TIMEOUT_MS)),
      ]) as string[];
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
    const firstImage = images[0];
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
