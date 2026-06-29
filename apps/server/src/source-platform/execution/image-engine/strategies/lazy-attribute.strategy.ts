// ============================================================
// image-engine/strategies/lazy-attribute.strategy.ts
// LazyAttributeStrategy — 懒加载图片属性提取
//
// 专门处理通过 data-* 属性懒加载的图片。
// 很多漫画站用 JS 懒加载: <img data-src="real.jpg" src="placeholder.gif">
// 或 <img data-original="..." src="loading.gif">
// ============================================================

import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { IImageStrategy, ImageContext, ImageExtractResult } from '../types';
import type { SourceImage } from '../../../runtime/source-driver.interface';

/** 按优先级排列的懒加载属性名 */
const LAZY_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-url',
  'data-img',
  'data-image',
  'data-srcset',
  'srcset',
  'data-cfsrc',      // CloudFlare lazy
  'data-echo',        // Echo.js lazy
  'data-layzr',       // Layzr.js
  'data-lazy',        // generic lazy
];

@Injectable()
export class LazyAttributeStrategy implements IImageStrategy {
  readonly name = 'LazyAttribute';
  readonly priority = 20; // CSS Selector 之后 fallback
  readonly needsHtml = true;

  canHandle(context: ImageContext): boolean {
    return !!context.html;
  }

  async extract(context: ImageContext): Promise<ImageExtractResult> {
    const host = (context.driver as any).host || '';
    const $ = cheerio.load(context.html!);
    const images: SourceImage[] = [];
    const seen = new Set<string>(); // 去重

    try {
      // 扫描所有 <img> 标签，提取懒加载属性
      $('img').each((_, el) => {
        for (const attr of LAZY_ATTRIBUTES) {
          const val = $(el).attr(attr);
          if (val && val.length > 10 && !seen.has(val)) {
            const url = val.startsWith('http') ? val
              : val.startsWith('//') ? 'https:' + val
              : this.resolveUrl(host, val);
            if (url.startsWith('http') && !seen.has(url)) {
              seen.add(url);
              images.push({ url });
              break; // 一个元素的第一个有效属性即可
            }
          }
        }
      });

      if (images.length > 0) {
        return { success: true, images, strategy: this.name };
      }
      return { success: false, images: [], strategy: this.name, error: 'No lazy-loaded images found' };
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
