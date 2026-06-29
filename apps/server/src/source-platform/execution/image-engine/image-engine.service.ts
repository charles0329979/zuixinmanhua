// ============================================================
// image-engine/image-engine.service.ts
// ImageEngine — 图片策略引擎 (V1)
//
// ★ 替代所有"单一 CSS selector"图片逻辑。
// ★ 唯一图片解析入口，被 ImagesExecutor 调用。
//
// 策略链 (按 priority 升序执行，首个成功即返回):
//   priority=0  → AdapterDelegate (adapter 原生逻辑)
//   priority=5  → XhrApi (专用图片 API)
//   priority=10 → CssSelector (标准 CSS 选择器)
//   priority=20 → LazyAttribute (懒加载属性)
//   priority=30 → JsonInline (JSON 内联数据)
//   priority=40 → BackgroundImage (CSS background-image)
//
// 每条策略:
//   - 独立、无状态、可插拔
//   - canHandle() 判断是否适用
//   - extract() 失败 → 自动 fallback 到下一条策略
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import type { ISourceDriver, SourceImagesInput, SourceImage } from '../../runtime/source-driver.interface';
import type { IImageStrategy, ImageContext } from './types';

// 策略
import { AdapterDelegateStrategy } from './strategies/adapter-delegate.strategy';
import { XhrApiStrategy } from './strategies/xhr-api.strategy';
import { CssSelectorStrategy } from './strategies/css-selector.strategy';
import { LazyAttributeStrategy } from './strategies/lazy-attribute.strategy';
import { JsonInlineStrategy } from './strategies/json-inline.strategy';
import { BackgroundImageStrategy } from './strategies/background-image.strategy';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

@Injectable()
export class ImageEngine {
  private readonly logger = new Logger(ImageEngine.name);
  private readonly strategies: IImageStrategy[];

  constructor(
    private readonly adapterDelegate: AdapterDelegateStrategy,
    private readonly xhrApi: XhrApiStrategy,
    private readonly cssSelector: CssSelectorStrategy,
    private readonly lazyAttribute: LazyAttributeStrategy,
    private readonly jsonInline: JsonInlineStrategy,
    private readonly backgroundImage: BackgroundImageStrategy,
  ) {
    // 按 priority 排序，确保确定性
    this.strategies = [
      adapterDelegate,
      xhrApi,
      cssSelector,
      lazyAttribute,
      jsonInline,
      backgroundImage,
    ].sort((a, b) => a.priority - b.priority);
  }

  /**
   * ★ 唯一入口 — 提取章节所有图片 URL
   *
   * @param driver  书源驱动
   * @param input   章节参数 (comicId, chapterId)
   * @returns       图片列表
   */
  async extract(driver: ISourceDriver, input: SourceImagesInput): Promise<SourceImage[]> {
    const startTime = Date.now();
    const context: ImageContext = {
      driver,
      comicId: input.comicId,
      chapterId: input.chapterId,
    };

    // Step 1: 预取 HTML (只获取一次，所有 HTML-based 策略共享)
    const needsHtml = this.strategies.some(s => s.needsHtml && s.canHandle(context));
    if (needsHtml) {
      const fetchResult = await this.fetchChapterHtml(driver, input);
      context.html = fetchResult.html;
      context.chapterUrl = fetchResult.chapterUrl;
      if (!context.html) {
        this.logger.debug(`ImageEngine[${driver.sourceId}]: HTML fetch failed, HTML-based strategies will be skipped`);
      }
    }

    // Step 2: 按优先级依次尝试策略
    for (const strategy of this.strategies) {
      if (!strategy.canHandle(context)) {
        continue;
      }

      try {
        const result = await strategy.extract(context);
        if (result.success && result.images.length > 0) {
          const elapsed = Date.now() - startTime;
          // 过滤明显不是图片的 URL (占位符、loading 图等)
          const filtered = this.filterPlaceholders(result.images);
          this.logger.debug(
            `ImageEngine[${driver.sourceId}]: ${strategy.name} → ${filtered.length} images (${elapsed}ms)`,
          );
          if (filtered.length > 0) {
            return filtered;
          }
        }
        // 策略返回 success=false → 自动 fallback
      } catch (e: any) {
        this.logger.debug(`ImageEngine[${driver.sourceId}]: ${strategy.name} threw: ${e.message?.slice(0, 80)}`);
        // 策略抛异常 → 继续下一条
      }
    }

    // Step 3: 所有策略都失败
    this.logger.warn(
      `ImageEngine[${driver.sourceId}]: ALL strategies failed for chapter ${input.chapterId} (${Date.now() - startTime}ms)`,
    );
    return [];
  }

  /**
   * 列出所有已注册策略 (诊断用)
   */
  listStrategies(): { name: string; priority: number; needsHtml: boolean }[] {
    return this.strategies.map(s => ({
      name: s.name,
      priority: s.priority,
      needsHtml: s.needsHtml,
    }));
  }

  // ============================================================
  // Private: HTML 预取
  // ============================================================

  private async fetchChapterHtml(
    driver: ISourceDriver,
    input: SourceImagesInput,
  ): Promise<{ html?: string; chapterUrl?: string }> {
    try {
      // 1. 先用 driver.chapters() 找到章节 URL
      const chapters = await driver.chapters({ comicId: input.comicId });
      const chapter = chapters.find(
        c => (c.chapterId === input.chapterId || c.url === input.chapterId || encodeURIComponent(c.url) === input.chapterId),
      );
      const chapterUrl = chapter?.url || input.chapterId;

      // 2. 构造完整 URL
      const host = (driver as any).host || '';
      const fullUrl = chapterUrl.startsWith('http') ? chapterUrl
        : (host.endsWith('/') ? host + chapterUrl.replace(/^\//, '') : host + '/' + chapterUrl.replace(/^\//, ''));

      // 3. 获取 HTML
      const response = await axios.get(fullUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Referer': host,
        },
        responseType: 'text',
        httpsAgent: insecureAgent,
        maxRedirects: 5,
      });

      const html = typeof response.data === 'string' ? response.data : String(response.data || '');
      return { html, chapterUrl: fullUrl };
    } catch (e: any) {
      return {};
    }
  }

  // ============================================================
  // Private: 过滤占位符 / loading 图
  // ============================================================

  private filterPlaceholders(images: SourceImage[]): SourceImage[] {
    const placeholderPatterns = [
      /placeholder/i, /loading/i, /spinner/i, /1x1/i,
      /pixel/i, /blank/i, /default/i, /transparent/i, /empty/i,
    ];
    return images.filter(img => {
      const url = img.url.toLowerCase();
      return !placeholderPatterns.some(p => p.test(url));
    });
  }
}
