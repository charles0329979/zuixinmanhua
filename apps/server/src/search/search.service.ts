import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { SourceConfigService } from '../sources/config/source-config.service';
import { CircuitBreakerService } from '../sources/circuit-breaker.service';
import { DatabaseService } from '../database/database.service';
import { ComicInfo } from '../sources/adapter.interface';
import { SourceStoreService } from '../sources/source-store.service';
import { searchBySource } from '../sources/source-parser';
import { RankedResult, rankAndFilter, scoreResult } from './search-ranker';

export interface SourceSearchResult {
  sourceId: string;
  sourceName: string;
  sourceType: 'hardcoded' | 'rule' | 'comicfs';
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
    ruleSources: number;
    hardcodedSources: number;
  };
}

const DEFAULT_TIMEOUT_MS = 5000;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly configService: SourceConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly sourceStore: SourceStoreService,
    private readonly db: DatabaseService,
  ) {}

  async searchAll(query: string): Promise<SearchResponse> {
    const q = (query || '').trim();
    if (!q) {
      return {
        query: '',
        sources: [],
        summary: { totalResults: 0, sourcesSearched: 0, sourcesFailed: 0, sourcesSkipped: 0, ruleSources: 0, hardcodedSources: 0 },
      };
    }

    // --- Hardcoded sources ---
    const hcConfigs = this.configService.getEnabledSources();
    const sorted = hcConfigs.sort((a, b) => {
      const order = { core: 0, supplement: 1, disabled: 2 };
      return (order[a.tier] ?? 99) - (order[b.tier] ?? 99);
    });
    const searchableHc = sorted.filter((c) => {
      const row = this.configService.getRawConfig(c.sourceId);
      const mode = (row as any)?.mode || 'server-parser';
      if (mode === 'external-only') return false;
      if (this.circuitBreaker.isBlocked(c.sourceId)) return false;
      return true;
    });

    // --- Rule-based sources (disabled temporarily — too many concurrency issues) ---
    // TODO: implement source-by-source staggered search with proper concurrency limits
    const ruleSources: any[] = [];

    const totalSearchable = searchableHc.length + ruleSources.length;

    this.logger.log(
      `Search "${q}" → ${searchableHc.length} hardcoded + ${ruleSources.length} rule sources`,
    );

    let totalResults = 0;
    let sourcesFailed = 0;
    const skipCount = hcConfigs.length - searchableHc.length;

    // --- Search hardcoded sources ---
    const hcPromises = searchableHc.map(async (config): Promise<SourceSearchResult> => {
      const start = Date.now();
      try {
        const adapter = await this.sourcesService.getAdapter(config.sourceId);
        if (!adapter) {
          sourcesFailed++;
          return {
            sourceId: config.sourceId, sourceName: config.name, sourceType: 'hardcoded',
            tier: config.tier, healthStatus: 'unavailable',
            results: [], responseTimeMs: Date.now() - start,
            error: '书源暂不可用',
          };
        }
        const raw = await adapter.search(q);
        const ranked = rankAndFilter(
          raw.map(r => ({
            title: r.title, cover: r.cover || '', detailUrl: r.comicId,
            comicId: r.comicId, sourceId: config.sourceId, sourceName: config.name,
            sourceType: 'hardcoded' as const, author: r.author,
            latestChapter: r.lastChapter, status: r.status,
          })),
          q,
        );
        totalResults += ranked.length;
        return {
          sourceId: config.sourceId, sourceName: config.name, sourceType: 'hardcoded',
          tier: config.tier, healthStatus: this.getSourceOverallHealth(config.sourceId),
          results: ranked, responseTimeMs: Date.now() - start,
        };
      } catch (e: any) {
        sourcesFailed++;
        if (e.constructor?.name === 'CircuitBreakerError') {
          this.circuitBreaker.recordFailure(config.sourceId, e);
        }
        return {
          sourceId: config.sourceId, sourceName: config.name, sourceType: 'hardcoded',
          tier: config.tier, healthStatus: this.getSourceOverallHealth(config.sourceId),
          results: [], responseTimeMs: Date.now() - start, error: e.message,
        };
      }
    });

    // --- Search rule-based sources (with timeout) ---
    const rulePromises = ruleSources.map(async (source): Promise<SourceSearchResult> => {
      const start = Date.now();
      const timeoutMs = source.timeoutMs || DEFAULT_TIMEOUT_MS;

      try {
        const raw = await Promise.race([
          searchBySource(source, q),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);

        const ranked = rankAndFilter(
          raw.map(r => ({
            title: r.title, cover: r.cover || '', detailUrl: r.detailUrl,
            comicId: r.detailUrl, sourceId: source.id, sourceName: source.name,
            sourceType: 'rule' as const, author: undefined,
            latestChapter: r.latestChapter, status: r.status,
          })),
          q,
        );
        totalResults += ranked.length;
        return {
          sourceId: source.id, sourceName: source.name, sourceType: 'rule',
          tier: 'supplement', healthStatus: 'unknown',
          results: ranked, responseTimeMs: Date.now() - start,
        };
      } catch (e: any) {
        sourcesFailed++;
        return {
          sourceId: source.id, sourceName: source.name, sourceType: 'rule',
          tier: 'supplement', healthStatus: 'unknown',
          results: [], responseTimeMs: Date.now() - start, error: e.message?.slice(0, 200),
        };
      }
    });

    // --- Execute all in parallel with global timeout ---
    const GLOBAL_TIMEOUT_MS = 8000;
    const allPromises = Promise.allSettled([...hcPromises, ...rulePromises]);
    const allResults = await Promise.race([
      allPromises,
      new Promise<PromiseSettledResult<SourceSearchResult>[]>((resolve) =>
        setTimeout(() => resolve([]), GLOBAL_TIMEOUT_MS)
      ),
    ]);
    const sources = allResults.length > 0
      ? allResults.map(r =>
          r.status === 'fulfilled' ? r.value : {
            sourceId: 'unknown', sourceName: 'unknown', sourceType: 'hardcoded' as const,
            tier: 'supplement', healthStatus: 'error',
            results: [], responseTimeMs: 0, error: '搜索异常',
          },
        )
      : [{
          sourceId: 'system', sourceName: '系统', sourceType: 'hardcoded' as const,
          tier: 'core', healthStatus: 'healthy',
          results: [], responseTimeMs: GLOBAL_TIMEOUT_MS, error: '搜索超时，请尝试单源搜索',
        }];

    return {
      query: q,
      sources,
      summary: {
        totalResults,
        sourcesSearched: totalSearchable,
        sourcesFailed,
        sourcesSkipped: skipCount,
        ruleSources: ruleSources.length,
        hardcodedSources: searchableHc.length,
      },
    };
  }

  async searchOne(source: string, query: string): Promise<SourceSearchResult> {
    const q = query.trim();
    const start = Date.now();

    // Try hardcoded first
    const config = this.configService.getConfig(source);
    if (config) {
      try {
        const adapter = await this.sourcesService.getAdapter(source);
        if (adapter) {
          const raw = await adapter.search(q);
          const ranked = rankAndFilter(
            raw.map(r => ({
              title: r.title, cover: r.cover || '', detailUrl: r.comicId,
              comicId: r.comicId, sourceId: source, sourceName: config.name,
              sourceType: 'hardcoded' as const, author: r.author,
              latestChapter: r.lastChapter, status: r.status,
            })),
            q,
          );
          return {
            sourceId: source, sourceName: config.name, sourceType: 'hardcoded',
            tier: config.tier, healthStatus: this.getSourceOverallHealth(source),
            results: ranked, responseTimeMs: Date.now() - start,
          };
        }
      } catch (e: any) {
        return {
          sourceId: source, sourceName: config.name, sourceType: 'hardcoded',
          tier: config.tier, healthStatus: 'error',
          results: [], responseTimeMs: Date.now() - start, error: e.message,
        };
      }
    }

    // Try rule source
    const ruleSource = this.sourceStore.getById(source);
    if (ruleSource && ruleSource.enabled) {
      try {
        const raw = await searchBySource(ruleSource, q);
        const ranked = rankAndFilter(
          raw.map(r => ({
            title: r.title, cover: r.cover || '', detailUrl: r.detailUrl,
            comicId: r.detailUrl, sourceId: source, sourceName: ruleSource.name,
            sourceType: 'rule' as const, author: undefined,
            latestChapter: r.latestChapter, status: r.status,
          })),
          q,
        );
        return {
          sourceId: source, sourceName: ruleSource.name, sourceType: 'rule',
          tier: 'supplement', healthStatus: 'unknown',
          results: ranked, responseTimeMs: Date.now() - start,
        };
      } catch (e: any) {
        return {
          sourceId: source, sourceName: ruleSource.name, sourceType: 'rule',
          tier: 'supplement', healthStatus: 'error',
          results: [], responseTimeMs: Date.now() - start, error: e.message,
        };
      }
    }

    return {
      sourceId: source, sourceName: source, sourceType: 'hardcoded',
      tier: 'disabled', healthStatus: 'unknown',
      results: [], responseTimeMs: 0, error: '书源不存在',
    };
  }

  private getSourceOverallHealth(sourceId: string): string {
    const checks = this.db.query<{ is_healthy: number }>(
      'SELECT is_healthy FROM source_health_status WHERE source_id = ?',
      [sourceId],
    );
    if (checks.length === 0) return 'unknown';
    const allHealthy = checks.every(c => c.is_healthy === 1);
    const anyHealthy = checks.some(c => c.is_healthy === 1);
    if (allHealthy) return 'healthy';
    if (anyHealthy) return 'degraded';
    return 'unhealthy';
  }
}
