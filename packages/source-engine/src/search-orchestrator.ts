// ============================================================
// packages/source-engine/src/search-orchestrator.ts
// ★ SearchOrchestrator — 本地并发搜索 + 渐进返回
// 可运行在 Mobile (fetch) / Server (axios) / Web (fetch)
// ============================================================

import type { IHttpClient } from '@zuixinmanhua/network';
import type { MangaSource } from '@zuixinmanhua/types';
import { createDomDocument } from '@zuixinmanhua/dom';
import { extractOne, extractList } from '@zuixinmanhua/parser';
import { RuleBasedAdapter } from '@zuixinmanhua/source-core';
import { resolveUrl } from '@zuixinmanhua/source-core';
import { SmartSourceSelector } from './source-selector';
import { scoreResult, getMatchLevel } from './search-ranker';
import type {
  SearchRequest, SearchResult, SearchBatch,
  SearchOrchestratorOptions,
} from './types';

export class SearchOrchestrator {
  private selector: SmartSourceSelector;

  constructor(
    private http: IHttpClient,
    private allSources: MangaSource[],
    options?: SearchOrchestratorOptions,
  ) {
    this.selector = new SmartSourceSelector();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private options: Required<SearchOrchestratorOptions>;

  /**
   * Search across all enabled sources, yielding results progressively.
   * Usage: for await (const batch of orchestrator.search({ query: 'test' })) { ... }
   */
  async *search(req: SearchRequest): AsyncGenerator<SearchBatch> {
    const q = req.query.trim();
    if (!q) return;

    const startTime = Date.now();
    const enabledSources = this.allSources.filter(s => s.enabled);
    let totalResults = 0;
    let batchNum = 0;
    const searchedIds = new Set<string>();

    const lanes = this.selector.selectLanes(enabledSources, q);

    for (const lane of lanes) {
      // Search sources in this lane concurrently
      const sources = lane.sources.filter(s => !searchedIds.has(s.id));
      if (sources.length === 0) continue;

      // Process in chunks based on concurrency
      for (let i = 0; i < sources.length; i += lane.concurrency) {
        const chunk = sources.slice(i, i + lane.concurrency);
        const promises = chunk.map(async (source) => {
          searchedIds.add(source.id);
          const startMs = Date.now();
          try {
            const results = await this.searchOneSource(source, q, lane.timeoutMs);
            const elapsed = Date.now() - startMs;
            this.selector.recordResult(source.id, results.length > 0, elapsed);
            return { source, results, elapsed, error: null };
          } catch (e: any) {
            const elapsed = Date.now() - startMs;
            this.selector.recordResult(source.id, false, elapsed);
            return { source, results: [] as SearchResult[], elapsed, error: e.message };
          }
        });

        const settled = await Promise.allSettled(promises);
        for (const r of settled) {
          if (r.status !== 'fulfilled') continue;
          const { source, results, error } = r.value;
          batchNum++;
          totalResults += results.length;

          const batch: SearchBatch = {
            batch: batchNum,
            results,
            totalSoFar: totalResults,
            sourceId: source.id,
            sourceName: source.name,
            sourceDone: true,
            searchDone: false,
            elapsedMs: Date.now() - startTime,
          };
          yield batch;
        }
      }
    }

    // Final batch: search complete
    yield {
      batch: -1,
      results: [],
      totalSoFar: totalResults,
      sourceId: '',
      sourceName: '',
      sourceDone: true,
      searchDone: true,
      elapsedMs: Date.now() - startTime,
    };
  }

  /** Search a single source, return ranked results */
  async searchOneSource(
    source: MangaSource,
    query: string,
    timeoutMs: number,
  ): Promise<SearchResult[]> {
    const rawResults = await this.fetchSourceResults(source, query, timeoutMs);
    return this.rankResults(rawResults, source, query);
  }

  /** Fetch raw results from a source (rule-based or hardcoded) */
  private async fetchSourceResults(
    source: MangaSource,
    query: string,
    timeoutMs: number,
  ): Promise<Array<{ title: string; cover: string; detailUrl: string }>> {
    // Use RuleBasedAdapter for rule-based sources
    const adapter = new RuleBasedAdapter(source, this.http);

    try {
      const comics = await Promise.race([
        adapter.search(query),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeoutMs),
        ),
      ]);

      return comics.map(c => ({
        title: c.title,
        cover: c.cover || '',
        detailUrl: c.comicId,
      }));
    } catch {
      return [];
    }
  }

  /** Apply ranking to raw results */
  private rankResults(
    raw: Array<{ title: string; cover: string; detailUrl: string }>,
    source: MangaSource,
    query: string,
  ): SearchResult[] {
    const minScore = 20;
    const ranked = raw
      .map(r => {
        const score = scoreResult(r.title, query);
        return {
          comicId: r.detailUrl || r.title,
          title: r.title,
          cover: r.cover ? resolveUrl(r.cover, source.host) : '',
          coverProxyUrl: undefined,
          detailUrl: r.detailUrl,
          sourceId: source.id,
          sourceName: source.name,
          sourceType: 'rule' as const,
          matchScore: score,
          matchLevel: getMatchLevel(score),
        };
      })
      .filter(r => r.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore);

    return ranked;
  }
}

const DEFAULT_OPTIONS: Required<SearchOrchestratorOptions> = {
  fastLaneSize: 5,
  batchLaneSize: 15,
  defaultTimeout: 5000,
  defaultConcurrency: 4,
};
