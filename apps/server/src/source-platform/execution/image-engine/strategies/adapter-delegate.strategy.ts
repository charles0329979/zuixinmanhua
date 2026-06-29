// ============================================================
// image-engine/strategies/adapter-delegate.strategy.ts
// AdapterDelegateStrategy — 硬编码适配器的原生图片提取
//
// 适用于: baozi, manwa, kanman, yeman 等 TypeScript adapter
// 这些 adapter 有自己的图片提取逻辑（加密解密、HTTP/2 等）
// ============================================================

import { Injectable } from '@nestjs/common';
import type { IImageStrategy, ImageContext, ImageExtractResult } from '../types';

@Injectable()
export class AdapterDelegateStrategy implements IImageStrategy {
  readonly name = 'AdapterDelegate';
  readonly priority = 0; // ★ 最高优先级 — adapter 自定义逻辑优先
  readonly needsHtml = false;

  canHandle(context: ImageContext): boolean {
    return context.driver.type === 'adapter';
  }

  async extract(context: ImageContext): Promise<ImageExtractResult> {
    try {
      const images = await context.driver.images({
        comicId: context.comicId,
        chapterId: context.chapterId,
      });

      if (images && images.length > 0) {
        return { success: true, images, strategy: this.name };
      }
      return { success: false, images: [], strategy: this.name, error: 'Adapter returned 0 images' };
    } catch (e: any) {
      return { success: false, images: [], strategy: this.name, error: e.message };
    }
  }
}
