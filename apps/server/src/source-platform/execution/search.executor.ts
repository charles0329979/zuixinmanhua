// ============================================================
// source-platform/execution/search.executor.ts
// SearchExecutor — 纯搜索执行逻辑 (不查 registry)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ISourceDriver, SourceSearchInput, SourceSearchResult } from '../runtime/source-driver.interface';

const SEARCH_TIMEOUT_MS = 15000;
const MAX_CONCURRENT = 15;

export interface SearchResult {
  driverId: string;
  driverName: string;
  results: SourceSearchResult[];
  error?: string;
}

@Injectable()
export class SearchExecutor {
  private readonly logger = new Logger(SearchExecutor.name);

  /** 单驱动搜索 */
  async execute(driver: ISourceDriver, input: SourceSearchInput): Promise<SourceSearchResult[]> {
    return Promise.race([
      driver.search(input),
      new Promise<SourceSearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), SEARCH_TIMEOUT_MS),
      ),
    ]);
  }

  /** 多驱动并发搜索 */
  async executeAll(drivers: ISourceDriver[], keyword: string): Promise<SearchResult[]> {
    const targets = drivers.slice(0, MAX_CONCURRENT);
    const input: SourceSearchInput = { keyword };

    const settled = await Promise.allSettled(
      targets.map(d => this.execute(d, input)),
    );

    return settled.map((r, i) => {
      const d = targets[i];
      if (r.status === 'fulfilled') {
        return { driverId: d.sourceId, driverName: d.sourceName, results: r.value };
      }
      return {
        driverId: d.sourceId, driverName: d.sourceName,
        results: [], error: (r.reason as Error)?.message || String(r.reason),
      };
    });
  }
}
