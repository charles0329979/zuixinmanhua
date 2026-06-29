// ============================================================
// source-platform/execution/chapters.executor.ts
// ChaptersExecutor — 纯章节执行逻辑
// ============================================================

import { Injectable } from '@nestjs/common';
import type { ISourceDriver, SourceChaptersInput, SourceChapter } from '../runtime/source-driver.interface';

@Injectable()
export class ChaptersExecutor {
  async execute(driver: ISourceDriver, input: SourceChaptersInput): Promise<SourceChapter[]> {
    return driver.chapters(input);
  }
}
