// ============================================================
// packages/source-core/src/source-catalog.ts
// ★ SourceCatalog — 统一源目录 (硬编码 + 规则源)
// ============================================================

import type { ISourceAdapter, MangaSource, AdapterContext } from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import { AdapterFactory } from './adapter-factory';
import { RuleBasedAdapter } from './rule-engine/rule-based-adapter';

/** 书源存储接口 (由 apps 层提供具体实现) */
export interface ISourceStore {
  getById(id: string): MangaSource | null;
  getAll(): MangaSource[];
  getEnabled(): MangaSource[];
}

export class SourceCatalog {
  private adapterFactory: AdapterFactory;

  constructor(
    private httpClient: IHttpClient,
    private sourceStore: ISourceStore,
  ) {
    this.adapterFactory = new AdapterFactory(this.httpClient);
  }

  /**
   * 获取适配器实例
   * 优先级: 硬编码适配器 → 规则源
   */
  getAdapter(
    sourceId: string,
    context: AdapterContext,
  ): ISourceAdapter | null {
    // 1. 尝试硬编码适配器
    const hardcoded = this.adapterFactory.create(sourceId, context);
    if (hardcoded) return hardcoded;

    // 2. 尝试规则源
    const mangaSource = this.sourceStore.getById(sourceId);
    if (mangaSource && mangaSource.enabled) {
      return new RuleBasedAdapter(mangaSource, this.httpClient);
    }

    return null;
  }

  /** 获取所有可用源 ID (硬编码 + 规则) */
  allSourceIds(): string[] {
    const ids = new Set(this.adapterFactory.listAdapterIds());
    for (const s of this.sourceStore.getAll()) {
      ids.add(s.id);
    }
    return [...ids];
  }

  /** 获取所有已启用源 ID */
  enabledSourceIds(): string[] {
    const ids = new Set(this.adapterFactory.listAdapterIds());
    for (const s of this.sourceStore.getEnabled()) {
      ids.add(s.id);
    }
    return [...ids];
  }

  /** 获取适配器工厂 (用于注册自定义适配器) */
  getAdapterFactory(): AdapterFactory {
    return this.adapterFactory;
  }
}
