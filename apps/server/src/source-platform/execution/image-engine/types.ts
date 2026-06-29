// ============================================================
// image-engine/types.ts
// ImageEngine 统一类型定义
// ============================================================

import type { ISourceDriver, SourceImagesInput, SourceImage } from '../../runtime/source-driver.interface';

/**
 * 图片提取上下文 — 策略执行时需要的全部信息
 */
export interface ImageContext {
  /** 目标 driver */
  driver: ISourceDriver;
  /** 漫画 ID */
  comicId: string;
  /** 章节 ID 或 URL */
  chapterId: string;
  /** 章节页面 HTML (预取，HTML-based 策略共用) */
  html?: string;
  /** 章节 URL (从 driver 推断) */
  chapterUrl?: string;
}

/**
 * 单个图片提取策略的结果
 */
export interface ImageExtractResult {
  /** 是否成功提取到图片 */
  success: boolean;
  /** 提取到的图片列表 */
  images: SourceImage[];
  /** 使用的策略名称 */
  strategy: string;
  /** 失败原因 (success=false 时) */
  error?: string;
}

/**
 * 图片提取策略接口 — 所有策略必须实现
 *
 * 策略是无状态的。同一 driver 的多次调用之间不共享状态。
 * 策略可以标记 needsHtml=true 让引擎预取 HTML。
 */
export interface IImageStrategy {
  /** 策略名称 (用于日志和诊断) */
  readonly name: string;
  /** 优先级 (越小越先执行) */
  readonly priority: number;
  /** 是否需要预取 HTML */
  readonly needsHtml: boolean;

  /**
   * 判断此策略是否适用于当前 driver
   * (例如 AdapterDelegate 只适用于 adapter 类型)
   */
  canHandle(context: ImageContext): boolean;

  /**
   * 执行图片提取
   * @returns 提取结果。success=false 时引擎自动 fallback 到下一策略。
   */
  extract(context: ImageContext): Promise<ImageExtractResult>;
}
