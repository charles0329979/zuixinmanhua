// ============================================================
// image-engine/strategies/background-image.strategy.ts
// BackgroundImageStrategy — 从 CSS background-image 提取图片 URL
//
// 有些漫画站将图片放在 inline style 中:
//   <div style="background-image:url(/img/001.jpg)"></div>
// ============================================================

import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { IImageStrategy, ImageContext, ImageExtractResult } from '../types';
import type { SourceImage } from '../../../runtime/source-driver.interface';

@Injectable()
export class BackgroundImageStrategy implements IImageStrategy {
  readonly name = 'BackgroundImage';
  readonly priority = 40;
  readonly needsHtml = true;

  canHandle(context: ImageContext): boolean {
    return !!context.html;
  }

  async extract(context: ImageContext): Promise<ImageExtractResult> {
    const host = (context.driver as any).host || '';
    const $ = cheerio.load(context.html!);
    const images: SourceImage[] = [];
    const seen = new Set<string>();

    try {
      // 扫描所有带 style 属性的元素
      $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const match = style.match(/background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/i);
        if (match) {
          let url = match[1].trim();
          if (url && url.length > 5 && /\.(jpg|jpeg|png|gif|webp|avif|bmp)/i.test(url)) {
            if (url.startsWith('//')) url = 'https:' + url;
            else if (!url.startsWith('http')) url = this.resolveUrl(host, url);
            if (url.startsWith('http') && !seen.has(url)) {
              seen.add(url);
              images.push({ url });
            }
          }
        }
      });

      if (images.length > 0) {
        return { success: true, images, strategy: this.name };
      }
      return { success: false, images: [], strategy: this.name, error: 'No background-image URLs found' };
    } catch (e: any) {
      return { success: false, images: [], strategy: this.name, error: e.message };
    }
  }

  private resolveUrl(base: string, relative: string): string {
    if (!base || relative.startsWith('http')) return relative;
    if (relative.startsWith('//')) return 'https:' + relative;
    try {
      const u = new URL(base);
      return relative.startsWith('/') ? `${u.protocol}//${u.host}${relative}` : `${base.endsWith('/') ? base : base + '/'}${relative}`;
    } catch { return relative; }
  }
}
