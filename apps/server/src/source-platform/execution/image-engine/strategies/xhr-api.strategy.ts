// ============================================================
// image-engine/strategies/xhr-api.strategy.ts
// XhrApiStrategy — 通过专用 API 端点获取图片列表
//
// 适用于 imagesApi 配置了独立接口的源。
// 例如某些源通过 AJAX 加载章节图片 JSON:
//   GET /api/chapter/images?chapterId=123
//   → {"images": ["url1","url2",...]}
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { IImageStrategy, ImageContext, ImageExtractResult } from '../types';
import type { SourceImage } from '../../../runtime/source-driver.interface';

@Injectable()
export class XhrApiStrategy implements IImageStrategy {
  readonly name = 'XhrApi';
  readonly priority = 5; // 高优先级 — 专用 API 通常最可靠
  readonly needsHtml = false;

  private readonly logger = new Logger(XhrApiStrategy.name);

  canHandle(context: ImageContext): boolean {
    // 检查 source 是否有 imagesApi 配置
    const source = (context.driver as any).source;
    return !!(source?.imagesApi);
  }

  async extract(context: ImageContext): Promise<ImageExtractResult> {
    const source = (context.driver as any).source;
    const api = source.imagesApi;
    const host = (context.driver as any).host || source?.host || '';

    try {
      // 构造 API URL
      let apiUrl = api.url || '';
      if (!apiUrl) {
        // 没有 URL 直接用 chapterUrl
        apiUrl = context.chapterUrl || context.chapterId;
      }
      // 替换占位符
      apiUrl = apiUrl.replace(/\{\{chapterId\}\}/g, context.chapterId);
      apiUrl = apiUrl.replace(/\{\{comicId\}\}/g, context.comicId);
      if (!apiUrl.startsWith('http')) {
        apiUrl = host.endsWith('/') ? host + apiUrl.replace(/^\//, '') : host + apiUrl;
      }

      const response = await axios.get(apiUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': host,
        },
        responseType: api.responseType === 'text' ? 'text' : 'json',
      });

      const data = response.data;
      const images: SourceImage[] = [];

      if (typeof data === 'string') {
        // 尝试解析 JSON 字符串
        try {
          const parsed = JSON.parse(data);
          this.collectUrls(parsed, images);
        } catch {
          // 纯文本，提取所有 HTTP URL
          const matches = data.match(/https?:\/\/[^"'\s]+/g);
          if (matches) {
            matches.forEach(u => {
              if (/\.(jpg|jpeg|png|gif|webp|avif|bmp)/i.test(u)) {
                images.push({ url: u });
              }
            });
          }
        }
      } else if (typeof data === 'object') {
        this.collectUrls(data, images);
      }

      if (images.length > 0) {
        return { success: true, images, strategy: this.name };
      }
      return { success: false, images: [], strategy: this.name, error: 'API returned 0 valid image URLs' };
    } catch (e: any) {
      return { success: false, images: [], strategy: this.name, error: `API call failed: ${e.message}` };
    }
  }

  private collectUrls(obj: any, images: SourceImage[]): void {
    const seen = new Set<string>();
    const walk = (val: any) => {
      if (typeof val === 'string' && /^https?:\/\//.test(val) && /\.(jpg|jpeg|png|gif|webp|avif|bmp)/i.test(val)) {
        if (!seen.has(val)) { seen.add(val); images.push({ url: val }); }
      } else if (Array.isArray(val)) {
        val.forEach(walk);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(walk);
      }
    };
    walk(obj);
  }
}
