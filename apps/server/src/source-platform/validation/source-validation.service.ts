// ============================================================
// source-platform/validation/source-validation.service.ts
// SourceValidationService — 统一全链路验证
//
// 使用 SourceRuntimeService 直接调用 driver 方法进行验证，
// 不依赖旧的 source-parser/source-store。
// adapter 和 rule-source 都通过 ISourceDriver 统一接口验证。
//
// 6步验证漏斗:
//   1. Static — 基本字段完整性检查
//   2. Search — 4个测试关键词搜索
//   3. Detail — 取第一个搜索结果获取详情
//   4. Chapters — 获取章节列表
//   5. Images — 取最后一个章节获取图片
//   6. Proxy — HTTP HEAD 检查第一张图片是否可加载
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { SourceRuntimeService } from '../runtime/source-runtime.service';
import { SourcePromotionService } from '../release/source-promotion.service';
import type { ISourceDriver } from '../runtime/source-driver.interface';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ---- 类型 ----

export interface ValidationResult {
  driverId: string;
  driverName: string;
  staticPassed: boolean;
  searchPassed: boolean;
  detailPassed: boolean;
  chaptersPassed: boolean;
  imagesPassed: boolean;
  proxyPassed: boolean;
  testedAt: string;
  testKeyword?: string;
  resultCount?: number;
  firstComicTitle?: string;
  firstComicUrl?: string;
  firstChapterTitle?: string;
  chapterCount?: number;
  imageCount?: number;
  firstImageUrl?: string;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface HealthScore {
  total: number;
  staticScore: number;
  networkScore: number;
  searchScore: number;
  detailScore: number;
  chapterScore: number;
  imageScore: number;
  latencyScore: number;
  recommendation: 'PROMOTE' | 'KEEP_CANDIDATE' | 'QUARANTINE' | 'MANUAL_REVIEW';
}

// ---- 常量 ----

const TEST_KEYWORDS = ['海贼王', '火影忍者', '一拳超人', '斗罗大陆'];
const STEP_TIMEOUT_MS = 15000;
const PROMOTE_THRESHOLD = 85;

/** 安全黑名单 — 已知恶意/钓鱼域名 */
const SECURITY_BLACKLIST = [
  'localhost', '127.0.0.1', '0.0.0.0',
  '169.254', // link-local
  '10.', '172.16.', '192.168.', // private networks
];

@Injectable()
export class SourceValidationService {
  private readonly logger = new Logger(SourceValidationService.name);

  constructor(
    private readonly runtime: SourceRuntimeService,
    private readonly promotion: SourcePromotionService,
  ) {}

  // ============================================================
  // 单源验证
  // ============================================================

  async validate(driverId: string): Promise<{
    ok: boolean;
    status: string;
    validation: ValidationResult;
    health?: HealthScore;
    error?: string;
  }> {
    const driver = this.runtime.getOptional(driverId);
    if (!driver) {
      return { ok: false, status: 'NOT_FOUND', error: `Driver not found: ${driverId}`, validation: this.emptyResult(driverId, '') };
    }

    const startTime = Date.now();
    const result = this.emptyResult(driverId, driver.sourceName);

    // ====== Step 0: Static check ======
    if (!this.staticCheck(driver, result)) {
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }

    // ====== Step 1: Search ======
    const searchResult = await this.trySearch(driver);
    if (!searchResult.passed) {
      result.searchPassed = false;
      result.errorCode = 'SEARCH_FAILED';
      result.errorMessage = searchResult.error;
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }
    result.searchPassed = true;
    result.testKeyword = searchResult.keyword;
    result.resultCount = searchResult.count;
    result.firstComicTitle = searchResult.firstTitle;
    result.firstComicUrl = searchResult.firstUrl;

    // ====== Step 2: Detail ======
    let detail: Awaited<ReturnType<ISourceDriver['detail']>>;
    try {
      detail = await this.withTimeout(
        this.runtime.detail(driver.sourceId, { comicId: searchResult.firstUrl! }),
        STEP_TIMEOUT_MS,
      );
    } catch (e: any) {
      result.detailPassed = false;
      result.errorCode = 'DETAIL_FAILED';
      result.errorMessage = `Detail failed: ${e.message}`;
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }
    // 通过条件: 有标题 || (有封面 && 有描述)
    result.detailPassed = !!(detail && (detail.title || (detail.cover && detail.description)));

    // ====== Step 3: Chapters ======
    let chapters: { chapterId: string; title: string; url: string; index: number }[];
    try {
      chapters = await this.withTimeout(
        this.runtime.chapters(driver.sourceId, { comicId: searchResult.firstUrl! }),
        STEP_TIMEOUT_MS,
      );
    } catch (e: any) {
      result.chaptersPassed = false;
      result.errorCode = 'CHAPTERS_FAILED';
      result.errorMessage = `Chapters failed: ${e.message}`;
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }
    result.chaptersPassed = !!(chapters && chapters.length > 0);
    result.chapterCount = chapters?.length || 0;

    if (!result.chaptersPassed) {
      result.errorCode = 'CHAPTERS_EMPTY';
      result.errorMessage = 'Chapter list is empty';
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }

    // Use last chapter for images test
    const testChapter = chapters[chapters.length - 1];
    result.firstChapterTitle = testChapter.title;

    // ====== Step 4: Images ======
    let images: { url: string }[];
    try {
      images = await this.withTimeout(
        this.runtime.images(driver.sourceId, { comicId: searchResult.firstUrl!, chapterId: testChapter.chapterId || testChapter.url }),
        STEP_TIMEOUT_MS,
      );
    } catch (e: any) {
      result.imagesPassed = false;
      result.errorCode = 'IMAGES_FAILED';
      result.errorMessage = `Images failed: ${e.message}`;
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }
    result.imagesPassed = !!(images && images.length > 0);
    result.imageCount = images?.length || 0;

    if (!result.imagesPassed) {
      result.errorCode = 'IMAGES_EMPTY';
      result.errorMessage = 'Image list is empty';
      result.latencyMs = Date.now() - startTime;
      return this.finish(driver, result, startTime);
    }

    // ====== Step 5: Proxy image check ======
    result.firstImageUrl = images[0]?.url || '';
    const proxyResult = await this.checkImageLoadable(images[0]?.url || '', (driver as any).host);
    result.proxyPassed = proxyResult.isImage;

    if (!result.proxyPassed) {
      result.errorCode = 'PROXY_FAILED';
      result.errorMessage = `Image not loadable: HTTP ${proxyResult.statusCode} ${proxyResult.contentType || ''}`;
    }

    result.latencyMs = Date.now() - startTime;
    return this.finish(driver, result, startTime);
  }

  // ============================================================
  // Score + action
  // ============================================================

  score(result: ValidationResult, driver: ISourceDriver): HealthScore {
    const s = (passed: boolean, w: number) => passed ? w : 0;
    const latencyScore =
      result.latencyMs < 1000 ? 5 :
      result.latencyMs < 3000 ? 4 :
      result.latencyMs < 5000 ? 3 :
      result.latencyMs < 10000 ? 2 : 1;

    const staticScore  = s(result.staticPassed, 15);
    const networkScore = s(result.searchPassed, 15); // search成功即网络可达
    const searchScore  = s(result.searchPassed, 20);
    const detailScore  = s(result.detailPassed, 15);
    const chapterScore = s(result.chaptersPassed, 15);
    const imageScore   = s(result.imagesPassed && result.proxyPassed, 15);
    const total = staticScore + networkScore + searchScore + detailScore + chapterScore + imageScore + latencyScore;

    let recommendation: HealthScore['recommendation'];

    // static fail → manual-review (格式不明/需人工适配)
    if (!result.staticPassed) {
      recommendation = 'MANUAL_REVIEW';
    }
    // 全链路通过 + 分数达标 → promote
    else if (result.searchPassed && result.detailPassed && result.chaptersPassed &&
             result.imagesPassed && result.proxyPassed && total >= PROMOTE_THRESHOLD) {
      recommendation = 'PROMOTE';
    }
    // 任何链路失败 → quarantine
    else if (!result.searchPassed || !result.detailPassed || !result.chaptersPassed ||
             !result.imagesPassed || !result.proxyPassed) {
      recommendation = 'QUARANTINE';
    }
    // 分数偏低 → keep candidate
    else if (total >= 70) {
      recommendation = 'KEEP_CANDIDATE';
    }
    // 分数太低 → quarantine
    else {
      recommendation = 'QUARANTINE';
    }

    return { total, staticScore, networkScore, searchScore, detailScore, chapterScore, imageScore, latencyScore, recommendation };
  }

  // ============================================================
  // Private: static check
  // ============================================================

  private staticCheck(driver: ISourceDriver, result: ValidationResult): boolean {
    if (!driver.sourceId || driver.sourceId.length === 0) {
      result.staticPassed = false;
      result.errorCode = 'STATIC_FAILED';
      result.errorMessage = 'Driver ID is empty';
      return false;
    }
    if (!driver.sourceName) {
      result.staticPassed = false;
      result.errorCode = 'STATIC_FAILED';
      result.errorMessage = 'Driver name is empty';
      return false;
    }
    const host = (driver as any).host || '';
    if (!host || (!host.startsWith('http://') && !host.startsWith('https://'))) {
      result.staticPassed = false;
      result.errorCode = 'STATIC_FAILED';
      result.errorMessage = `Invalid host: ${host}`;
      return false;
    }
    // 安全黑名单
    if (SECURITY_BLACKLIST.some(entry => host.includes(entry))) {
      result.staticPassed = false;
      result.errorCode = 'STATIC_FAILED';
      result.errorMessage = `Host matches security blacklist: ${host}`;
      return false;
    }
    result.staticPassed = true;
    return true;
  }

  // ============================================================
  // Private: search
  // ============================================================

  private async trySearch(driver: ISourceDriver): Promise<{
    passed: boolean;
    keyword?: string;
    firstTitle?: string;
    firstUrl?: string;
    count?: number;
    error?: string;
  }> {
    for (const kw of TEST_KEYWORDS) {
      try {
        const results = await this.withTimeout(this.runtime.search(driver.sourceId, { keyword: kw }), STEP_TIMEOUT_MS);
        if (results && results.length > 0) {
          const first = results[0];
          if (first.title && first.detailUrl) {
            return {
              passed: true,
              keyword: kw,
              firstTitle: first.title,
              firstUrl: first.detailUrl,
              count: results.length,
            };
          }
        }
      } catch (e: any) {
        this.logger.debug(`Validation[${driver.sourceId}] search "${kw}": ${e.message?.slice(0, 80)}`);
      }
    }
    return { passed: false, error: `All ${TEST_KEYWORDS.length} keywords returned 0 valid results` };
  }

  // ============================================================
  // Private: proxy image check
  // ============================================================

  private checkImageLoadable(url: string, host: string): Promise<{
    isImage: boolean;
    statusCode?: number;
    contentType?: string;
  }> {
    // URL 后缀判断: 即使 MIME type 不对，只要 URL 是图片扩展名也放行
    const urlLower = url.toLowerCase();
    const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|avif|svg)($|\?)/.test(urlLower);

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
            'Referer': host.endsWith('/') ? host : host + '/',
          },
          rejectUnauthorized: false,
        }, res => {
          const ct = (res.headers['content-type'] || '').toLowerCase();
          const isImageContentType = ct.startsWith('image/') || ct.includes('octet-stream') || ct.includes('binary');
          res.destroy();
          // HTTP 200 + (image mime OR octet-stream with image extension)
          const ok = res.statusCode === 200 && (isImageContentType || hasImageExt);
          resolve({ isImage: ok, statusCode: res.statusCode || 0, contentType: ct });
        });
        req.on('error', (e: any) => resolve({ isImage: false, statusCode: 0, contentType: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ isImage: false, statusCode: 0, contentType: 'timeout' }); });
        req.end();
      } catch (e: any) {
        resolve({ isImage: false, statusCode: 0, contentType: e.message });
      }
    });
  }

  // ============================================================
  // Private: helpers
  // ============================================================

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), ms),
      ),
    ]);
  }

  private emptyResult(id: string, name: string): ValidationResult {
    return {
      driverId: id,
      driverName: name,
      staticPassed: false,
      searchPassed: false,
      detailPassed: false,
      chaptersPassed: false,
      imagesPassed: false,
      proxyPassed: false,
      testedAt: new Date().toISOString(),
      latencyMs: 0,
    };
  }

  private finish(
    driver: ISourceDriver,
    result: ValidationResult,
    startTime: number,
  ): Awaited<ReturnType<SourceValidationService['validate']>> {
    const health = this.score(result, driver);
    const status = health.recommendation === 'PROMOTE' ? 'PROMOTED' :
                   health.recommendation === 'QUARANTINE' ? 'QUARANTINED' :
                   health.recommendation === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' :
                   'VERIFIED';

    this.logger.log(
      `Validation[${result.driverId}]: s=${result.searchPassed} d=${result.detailPassed} ` +
      `ch=${result.chaptersPassed} img=${result.imagesPassed} proxy=${result.proxyPassed} ` +
      `score=${health.total} rec=${health.recommendation} (${result.latencyMs}ms)`,
    );

    return { ok: true, status, validation: result, health };
  }
}
