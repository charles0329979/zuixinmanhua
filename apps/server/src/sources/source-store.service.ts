// ============================================================
// apps/server/src/sources/source-store.service.ts
// ISourceStore 实现 — 从文件和 DB 加载规则化源
//
// ★ V7: 完整 CRUD 包装，供 RuleBasedController 使用。
//        业务模块不再直接 import sourceStore 单例。
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

  /** @alias getAll */
  getSources(): MangaSource[] {
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

  /** 创建规则化源 */
  createSource(source: MangaSource): MangaSource {
    return fileSourceStore.createSource(source);
  }

  /** 更新规则化源 */
  updateSource(id: string, data: Partial<MangaSource>): MangaSource | null {
    return fileSourceStore.updateSource(id, data);
  }

  /** 删除规则化源 */
  deleteSource(id: string): boolean {
    return fileSourceStore.deleteSource(id);
  }

  /** 切换启用/禁用 */
  toggleSource(id: string): MangaSource | null {
    return fileSourceStore.toggleSource(id);
  }

  /** 批量导入 */
  importSources(sources: MangaSource[]): number {
    return fileSourceStore.importSources(sources);
  }

  /** 导出全部 */
  exportSources(): MangaSource[] {
    return fileSourceStore.exportSources();
  }
}
