// ============================================================
// packages/source-core/src/search-orchestrator.ts
// 聚合搜索编排器 — 并发搜索 + 去重 + 结果排序
// ============================================================

import type {
  AggregatedComicResult,
  AggregatedSearchResponse,
  AggregatedSourceResult,
} from '@zuixinmanhua/types';
import type { AdapterContext } from '@zuixinmanhua/types';
import { SourceCatalog } from './source-catalog';

export interface SearchOrchestratorOptions {
  concurrency: number;
  sourceTimeoutMs: number;
  dedupe: boolean;
}

const DEFAULT_OPTIONS: SearchOrchestratorOptions = {
  concurrency: 3,
  sourceTimeoutMs: 8000,
  dedupe: true,
};

export class SearchOrchestrator {
  constructor(
    private catalog: SourceCatalog,
    private options: SearchOrchestratorOptions = DEFAULT_OPTIONS,
  ) {}

  /**
   * 跨多个书源聚合搜索
   * @param query 搜索关键词
   * @param sourceIds 要使用的源 ID 列表（默认全部已启用）
   * @param defaultContext 适配器上下文工厂
   */
  async search(
    query: string,
    sourceIds?: string[],
    contextFactory?: (
      sourceId: string,
    ) => AdapterContext,
  ): Promise<AggregatedSearchResponse> {
    const ids = sourceIds || this.catalog.enabledSourceIds();
    const sources: AggregatedSourceResult[] = [];

    // 并发限制执行
    const results = await this.runWithConcurrency(
      ids,
      async (sourceId) => {
        const ctx = contextFactory
          ? contextFactory(sourceId)
          : this.defaultContext(sourceId);
        const adapter = this.catalog.getAdapter(sourceId, ctx);
        if (!adapter) {
          return {
            sourceId,
            sourceName: sourceId,
            results: [],
            error: 'Adapter not found',
          };
        }

        try {
          const comics = await adapter.search(query);
          const results: import('@zuixinmanhua/types').AggregatedComicResult[] = comics.map(
            (c: import('@zuixinmanhua/types').ComicInfo) => ({
              title: c.title,
              cover: c.cover,
              detailUrl: c.comicId,
              sourceId: c.source,
              sourceName: adapter.name,
              latestChapter: c.lastChapter,
              status: c.status,
              author: c.author,
            }),
          );
          return { sourceId, sourceName: adapter.name, results };
        } catch (e: unknown) {
          return {
            sourceId,
            sourceName: adapter.name,
            results: [],
            error:
              e instanceof Error ? e.message.slice(0, 200) : String(e),
          };
        }
      },
      this.options.concurrency,
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        sources.push(r.value);
      }
    }

    // 去重 + 合并
    const allResults = this.options.dedupe
      ? this.dedupeByTitle(sources.flatMap((s) => s.results))
      : sources.flatMap((s) => s.results);

    return {
      keyword: query,
      totalResults: allResults.length,
      sources,
    };
  }

  // ---- 私有方法 ----

  private defaultContext(sourceId: string): AdapterContext {
    return {
      baseUrl: '',
      timeout: this.options.sourceTimeoutMs,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      retries: 2,
    };
  }

  private async runWithConcurrency<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency: number,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
      const idx = results.length;
      results.push({
        status: 'pending',
      } as unknown as PromiseSettledResult<R>);

      const p = fn(item)
        .then((value) => {
          results[idx] = { status: 'fulfilled', value };
        })
        .catch((reason) => {
          results[idx] = { status: 'rejected', reason };
        });

      executing.push(p);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // 移除已完成的
        for (let i = executing.length - 1; i >= 0; i--) {
          const done = await this.isSettled(executing[i]);
          if (done) executing.splice(i, 1);
        }
      }
    }

    await Promise.allSettled(executing);
    return results;
  }

  private async isSettled(p: Promise<unknown>): Promise<boolean> {
    try {
      const result = await Promise.race([
        p.then(() => 'done' as const),
        new Promise<'pending'>((resolve) =>
          setTimeout(() => resolve('pending'), 0),
        ),
      ]);
      return result === 'done';
    } catch {
      return true;
    }
  }

  private dedupeByTitle(
    results: AggregatedComicResult[],
  ): AggregatedComicResult[] {
    const seen = new Map<string, AggregatedComicResult>();
    for (const r of results) {
      const key = `${r.title}:${r.author || ''}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, r);
      }
    }
    return [...seen.values()];
  }
}
