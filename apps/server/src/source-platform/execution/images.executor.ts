// ============================================================
// source-platform/execution/images.executor.ts
// ImagesExecutor — 图片执行器 (V8)
//
// ★ 通过 ImageEngine 策略链提取图片。
// ★ 不再直接调用 driver.images() — 由策略引擎统一决策。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ISourceDriver, SourceImagesInput, SourceImage } from '../runtime/source-driver.interface';
import { ImageEngine } from './image-engine/image-engine.service';

@Injectable()
export class ImagesExecutor {
  private readonly logger = new Logger(ImagesExecutor.name);

  constructor(private readonly imageEngine: ImageEngine) {}

  async execute(driver: ISourceDriver, input: SourceImagesInput): Promise<SourceImage[]> {
    // ★ 所有图片提取通过 ImageEngine 策略链
    return this.imageEngine.extract(driver, input);
  }
}
