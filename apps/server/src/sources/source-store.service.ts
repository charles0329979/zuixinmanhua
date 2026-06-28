// ============================================================
// apps/server/src/sources/source-store.service.ts
// ISourceStore 实现 — 从文件和 DB 加载规则化源
// ============================================================

import { Injectable } from '@nestjs/common';
import type { MangaSource } from './source-store';
import { sourceStore as fileSourceStore } from './source-store';

@Injectable()
export class SourceStoreService {
  /** 从 JSON 文件获取所有规则化源 */
  getAll(): MangaSource[] {
    return fileSourceStore.getSources();
  }

  /** 获取单个规则化源 */
  getById(id: string): MangaSource | null {
    return fileSourceStore.getSourceById(id);
  }

  /** 获取已启用的规则化源 */
  getEnabled(): MangaSource[] {
    return fileSourceStore.getEnabledSources();
  }
}
