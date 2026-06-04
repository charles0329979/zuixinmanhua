import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { SourceConfigService } from '../sources/config/source-config.service';
import { CircuitBreakerService } from '../sources/circuit-breaker.service';
import { DatabaseService } from '../database/database.service';
import { ComicInfo } from '../sources/adapter.interface';
import { CircuitBreakerError } from '../sources/source-policy.types';

export interface SourceSearchResult {
  source: string;
  sourceName: string;
  tier: string;
  healthStatus: string;
  results: ComicInfo[];
  error?: string;
  responseTimeMs?: number;
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
    private readonly sourcesService: SourcesService,
    private readonly configService: SourceConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly db: DatabaseService,
  ) {}

  async searchAll(query: string): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      return { query: '', sources: [], summary: { totalResults: 0, sourcesSearched: 0, sourcesFailed: 0, sourcesSkipped: 0 } };
    }

    const configs = this.configService.getEnabledSources();

    // 按 tier 排序：core 先，supplement 后
    const sorted = configs.sort((a, b) => {
      const order = { core: 0, supplement: 1, disabled: 2 };
      return (order[a.tier] ?? 99) - (order[b.tier] ?? 99);
    });

    const searchable = sorted.filter((c) => {
      const row = this.configService.getRawConfig(c.sourceId);
      const mode = (row as any)?.mode || 'server-parser';
      if (mode === 'external-only') return false;
      if (this.circuitBreaker.isBlocked(c.sourceId)) return false;
      return true;
    });

    const skipCount = sorted.length - searchable.length;
    this.logger.log(`🔍 搜索 "${query}" — ${searchable.length}/${sorted.length} 个可搜索书源${skipCount > 0 ? ` (${skipCount} 跳过)` : ''}`);

    let totalResults = 0;
    let sourcesFailed = 0;

    // Promise.allSettled — 单个源失败不影响其他源
    const promises = searchable.map(async (config) => {
      const start = Date.now();
      try {
        const adapter = await this.sourcesService.getAdapter(config.sourceId);
        if (!adapter) {
          sourcesFailed++;
          return {
            source: config.sourceId,
            sourceName: config.name,
            tier: config.tier,
            healthStatus: 'unavailable',
            results: [],
            error: '域名解析失败，书源暂不可用',
          };
        }
        const results = await adapter.search(query.trim());
        const responseTime = Date.now() - start;
        totalResults += results.length;

        try {
          this.db.run(
            'INSERT INTO source_search_logs (source_id, keyword, is_success, result_count, response_time_ms) VALUES (?, ?, 1, ?, ?)',
            [config.sourceId, query.trim(), results.length, responseTime],
          );
        } catch {}

        return {
          source: config.sourceId,
          sourceName: config.name,
          tier: config.tier,
          healthStatus: this.getSourceOverallHealth(config.sourceId),
          results,
          responseTimeMs: responseTime,
        };
      } catch (e: any) {
        sourcesFailed++;

        // 熔断错误 — 记录到熔断器
        if (e instanceof CircuitBreakerError) {
          this.circuitBreaker.recordFailure(config.sourceId, e);
        }

        const responseTime = Date.now() - start;
        try {
          this.db.run(
            'INSERT INTO source_search_logs (source_id, keyword, is_success, result_count, response_time_ms, error_message) VALUES (?, ?, 0, 0, ?, ?)',
            [config.sourceId, query.trim(), responseTime, e.message?.slice(0, 500)],
          );
        } catch {}
        return {
          source: config.sourceId,
          sourceName: config.name,
          tier: config.tier,
          healthStatus: this.getSourceOverallHealth(config.sourceId),
          results: [],
          error: e.message,
          responseTimeMs: responseTime,
        };
      }
    });

    const sources = await Promise.allSettled(promises).then((results) =>
      results.map((r) => (r.status === 'fulfilled' ? r.value : {
        source: 'unknown', sourceName: 'unknown', tier: 'supplement',
        healthStatus: 'error', results: [], error: '搜索过程异常',
      } as SourceSearchResult))
    );

    return {
      query: query.trim(),
      sources,
      summary: {
        totalResults,
        sourcesSearched: searchable.length,
        sourcesFailed,
        sourcesSkipped: skipCount,
      },
    };
  }

  async searchOne(source: string, query: string): Promise<SourceSearchResult> {
    const config = this.configService.getConfig(source);
    if (!config) throw new Error(`书源 ${source} 不存在`);
    const adapter = await this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不可用`);
    const results = await adapter.search(query.trim());
    return {
      source: adapter.id,
      sourceName: adapter.name,
      tier: config.tier,
      healthStatus: this.getSourceOverallHealth(source),
      results,
    };
  }

  /** 从 DB 获取书源总体健康状态 */
  private getSourceOverallHealth(sourceId: string): string {
    const checks = this.db.query<{ is_healthy: number }>(
      'SELECT is_healthy FROM source_health_status WHERE source_id = ?',
      [sourceId],
    );
    if (checks.length === 0) return 'unknown';
    const allHealthy = checks.every((c) => c.is_healthy === 1);
    const anyHealthy = checks.some((c) => c.is_healthy === 1);
    if (allHealthy) return 'healthy';
    if (anyHealthy) return 'degraded';
    return 'unhealthy';
  }
}
