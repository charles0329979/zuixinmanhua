// ============================================================
// image-engine/strategies/css-selector.strategy.ts
// CssSelectorStrategy — 标准 CSS 选择器图片提取
//
// 使用 MangaSource.images.listSelector 匹配 <img> 标签。
// 这是最通用的策略，适用于大多数传统漫画站。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { IImageStrategy, ImageContext, ImageExtractResult } from '../types';
import type { SourceImage } from '../../../runtime/source-driver.interface';

@Injectable()
export class CssSelectorStrategy implements IImageStrategy {
  readonly name = 'CssSelector';
  readonly priority = 10;
  readonly needsHtml = true;

  private readonly logger = new Logger(CssSelectorStrategy.name);

  canHandle(context: ImageContext): boolean {
    // 需要 HTML 才能工作
    return !!context.html;
  }

  async extract(context: ImageContext): Promise<ImageExtractResult> {
    const source = (context.driver as any).source;
    if (!source?.images?.listSelector) {
      return { success: false, images: [], strategy: this.name, error: 'No listSelector configured' };
    }

    const host = (context.driver as any).host || source?.host || '';
    const $ = cheerio.load(context.html!);
    const images: SourceImage[] = [];
    const srcAttr = source.images.srcAttribute || 'src';

    try {
      $(source.images.listSelector).each((_, el) => {
        try {
          // 主属性 + 常见 fallback
          const src = $(el).attr(srcAttr)
            || $(el).attr('data-src')
            || $(el).attr('data-original')
            || $(el).attr('src')
            || '';

          if (src && src.length > 5) {
            const url = src.startsWith('http') ? src : this.resolveUrl(host, src);
            if (url.startsWith('http')) {
              images.push({ url });
            }
          }
        } catch { /* 单个元素失败不影响整体 */ }
      });

      if (images.length > 0) {
        return { success: true, images, strategy: this.name };
      }
      return { success: false, images: [], strategy: this.name, error: 'CSS selector matched 0 valid image URLs' };
    } catch (e: any) {
      return { success: false, images: [], strategy: this.name, error: e.message };
    }
  }

  private resolveUrl(base: string, relative: string): string {
    if (!base || relative.startsWith('http')) return relative;
    if (relative.startsWith('//')) return 'https:' + relative;
    const baseUrl = base.endsWith('/') ? base : base + '/';
    if (relative.startsWith('/')) {
      try {
        const u = new URL(base);
        return `${u.protocol}//${u.host}${relative}`;
      } catch { return relative; }
    }
    return baseUrl + relative;
  }
}
