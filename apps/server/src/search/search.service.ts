import { Injectable, Logger } from '@nestjs/common';
import { SourcePlatformService } from '../source-platform/source-platform.service';
import { RankedResult, rankAndFilter } from './search-ranker';
import { ComicResult } from '../source-platform/runtime/source-driver.interface';

export interface SourceSearchResult {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  tier: string;
  healthStatus: string;
  results: RankedResult[];
  error?: string;
  responseTimeMs: number;
  skipped?: boolean;
  skipReason?: string;
}

export interface SearchResponse {
  query: string;
  sources: SourceSearchResult[];
  summary: {
    totalResults: number;
    sourcesSearched: number;
    sourcesFailed: number;
    sourcesSkipped: number;
  };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly platform: SourcePlatformService,
  ) {}

  /**
   * 聚合搜索所有已注册源
   *
   * 通过 SourcePlatformService 统一搜索，不再区分 adapter/rule-source。
   * SourcePlatformService 内部通过 SourceRuntimeService 并发调度所有 ISourceDriver。
   */
  async searchAll(query: string): Promise<SearchResponse> {
    const q = (query || '').trim();
    if (!q) {
      return {
        query: '',
        sources: [],
        summary: { totalResults: 0, sourcesSearched: 0, sourcesFailed: 0, sourcesSkipped: 0 },
      };
    }

    const start = Date.now();

    // 统一搜索 — 所有源通过 SourcePlatformService 执行
    const result = await this.platform.search(q);

    let totalResults = 0;
    let sourcesFailed = 0;

    const sources: SourceSearchResult[] = result.sources.map(s => {
      if (s.error) {
        sourcesFailed++;
        return {
          sourceId: s.sourceId,
          sourceName: s.sourceName,
          sourceType: s.sourceType,
          tier: 'supplement',
          healthStatus: 'error',
          results: [],
          error: s.error,
          responseTimeMs: 0,
        };
      }

      // 排名 & 过滤
      const ranked = rankAndFilter(
        (s.results as ComicResult[]).map(r => ({
          title: r.title,
          cover: r.cover || '',
          detailUrl: r.detailUrl,
          comicId: r.detailUrl,
          sourceId: r.sourceId,
          sourceName: r.sourceName,
          sourceType: 'source' as const,
          author: r.author,
          latestChapter: r.latestChapter,
          status: r.status,
        })),
        q,
      );

      totalResults += ranked.length;

      return {
        sourceId: s.sourceId,
        sourceName: s.sourceName,
        sourceType: s.sourceType,
        tier: 'supplement',
        healthStatus: 'healthy',
        results: ranked,
        responseTimeMs: 0,
      };
    });

    this.logger.log(
      `Search "${q}": ${sources.length - sourcesFailed} ok, ${sourcesFailed} failed, ${totalResults} results (${Date.now() - start}ms)`,
    );

    return {
      query: q,
      sources,
      summary: {
        totalResults,
        sourcesSearched: sources.length,
        sourcesFailed,
        sourcesSkipped: 0,
      },
    };
  }

  /**
   * 单源搜索
   */
  async searchOne(source: string, query: string): Promise<SourceSearchResult> {
    const q = query.trim();
    try {
      const results = await this.platform.searchOne(source, q);
      const ranked = rankAndFilter(
        results.map(r => ({
          title: r.title,
          cover: r.cover || '',
          detailUrl: r.detailUrl,
          comicId: r.detailUrl,
          sourceId: source,
          sourceName: r.sourceName,
          sourceType: 'source' as const,
          author: r.author,
          latestChapter: r.latestChapter,
          status: r.status,
        })),
        q,
      );
      return {
        sourceId: source,
        sourceName: '',
        sourceType: 'source',
        tier: 'supplement',
        healthStatus: 'healthy',
        results: ranked,
        responseTimeMs: 0,
      };
    } catch (e: any) {
      return {
        sourceId: source,
        sourceName: '',
        sourceType: 'source',
        tier: 'supplement',
        healthStatus: 'error',
        results: [],
        responseTimeMs: 0,
        error: e.message,
      };
    }
  }
}
