// ============================================================
// image-engine/strategies/json-inline.strategy.ts
// JsonInlineStrategy — 从 <script> / JSON 内联数据中提取图片 URL
//
// 很多现代漫画站将图片 URL 嵌入 script 标签:
//   <script>window.__DATA__ = {"images":["..."]}</script>
//   <script>var chapterData = {"page_urls":["..."]}</script>
// ============================================================

import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { IImageStrategy, ImageContext, ImageExtractResult } from '../types';
import type { SourceImage } from '../../../runtime/source-driver.interface';

/** 常见 JSON 内联变量名 */
const JSON_VAR_PATTERNS = [
  /window\.__DATA__\s*=\s*({[\s\S]*?});/,
  /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
  /window\.__NUXT__\s*=\s*({[\s\S]*?});/,
  /var\s+chapterData\s*=\s*({[\s\S]*?});/,
  /var\s+chapterImages\s*=\s*(\[[\s\S]*?\]);/,
  /var\s+pageData\s*=\s*({[\s\S]*?});/,
  /var\s+imgData\s*=\s*({[\s\S]*?});/,
  /chapterImages\s*=\s*(\[[\s\S]*?\]);/,
  /page_urls\s*=\s*(\[[\s\S]*?\]);/,
  /img_urls\s*=\s*(\[[\s\S]*?\]);/,
  /"images"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  /"page_urls"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  /"chapterImages"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
];

@Injectable()
export class JsonInlineStrategy implements IImageStrategy {
  readonly name = 'JsonInline';
  readonly priority = 30;
  readonly needsHtml = true;

  canHandle(context: ImageContext): boolean {
    return !!context.html;
  }

  async extract(context: ImageContext): Promise<ImageExtractResult> {
    const $ = cheerio.load(context.html!);
    const images: SourceImage[] = [];
    const seen = new Set<string>();

    try {
      // 扫描所有 <script> 标签内容
      $('script').each((_, el) => {
        const content = $(el).html() || '';
        if (!content || content.length < 20) return;

        for (const pattern of JSON_VAR_PATTERNS) {
          const match = content.match(pattern);
          if (!match) continue;

          try {
            const data = JSON.parse(match[1]);
            const urls = this.extractUrls(data);
            for (const url of urls) {
              if (!seen.has(url)) {
                seen.add(url);
                images.push({ url });
              }
            }
          } catch {
            // JSON 解析失败，尝试纯字符串提取
            const strUrls = this.extractUrlStrings(match[1]);
            for (const url of strUrls) {
              if (!seen.has(url)) {
                seen.add(url);
                images.push({ url });
              }
            }
          }
        }
      });

      if (images.length > 0) {
        return { success: true, images, strategy: this.name };
      }
      return { success: false, images: [], strategy: this.name, error: 'No JSON-inline image URLs found' };
    } catch (e: any) {
      return { success: false, images: [], strategy: this.name, error: e.message };
    }
  }

  /** 递归遍历 JSON 对象提取所有 HTTP URL */
  private extractUrls(obj: any): string[] {
    const urls: string[] = [];
    const walk = (val: any) => {
      if (typeof val === 'string' && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif|bmp)/i.test(val)) {
        urls.push(val);
      } else if (Array.isArray(val)) {
        val.forEach(walk);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(walk);
      }
    };
    walk(obj);
    return urls;
  }

  /** 从非标准 JSON 字符串中提取 URL */
  private extractUrlStrings(raw: string): string[] {
    const matches = raw.match(/https?:\/\/[^"'\s,]+\.(?:jpg|jpeg|png|gif|webp|avif|bmp)[^"'\s,]*/gi);
    return matches ? [...new Set(matches)] : [];
  }
}
