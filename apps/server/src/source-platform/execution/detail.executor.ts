// ============================================================
// source-platform/execution/detail.executor.ts
// DetailExecutor — 纯详情执行逻辑
// ============================================================

import { Injectable } from '@nestjs/common';
import type { ISourceDriver, SourceDetailInput, SourceComicDetail } from '../runtime/source-driver.interface';

@Injectable()
export class DetailExecutor {
  async execute(driver: ISourceDriver, input: SourceDetailInput): Promise<SourceComicDetail> {
    return driver.detail(input);
  }
}
