import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { SourceConfigService } from '../sources/config/source-config.service';
import { DatabaseService } from '../database/database.service';
import { ComicInfo } from '../sources/adapter.interface';

export interface SourceSearchResult {
  source: string;
  sourceName: string;
  tier: string;
  healthStatus: string;
  results: ComicInfo[];
  error?: string;
  responseTimeMs?: number;
}

export interface SearchResponse {
  query: string;
  sources: SourceSearchResult[];
  summary: {
    totalResults: number;
    sourcesSearched: number;
    sourcesFailed: number;
  };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly configService: SourceConfigService,
    private readonly db: DatabaseService,
  ) {}

  async searchAll(query: string): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      return { query: '', sources: [], summary: { totalResults: 0, sourcesSearched: 0, sourcesFailed: 0 } };
    }

    const configs = this.configService.getEnabledSources();
    // 过滤掉 unhealthy 和 disabled 的源
    const healthyConfigs = configs.filter((c) => {
      const health = this.getSourceOverallHealth(c.sourceId);
      return health !== 'unhealthy' && health !== 'disabled';
    });

    // 按 tier 排序：core 先，supplement 后
    const sorted = healthyConfigs.sort((a, b) => {
      const order = { core: 0, supplement: 1, disabled: 2 };
      return (order[a.tier] ?? 99) - (order[b.tier] ?? 99);
    });

    this.logger.log(`🔍 搜索 "${query}" — ${sorted.length}/${configs.length} 个健康书源`);

    let totalResults = 0;
    let sourcesFailed = 0;

    const promises = sorted.map(async (config) => {
      const start = Date.now();
      try {
        const adapter = await this.sourcesService.getAdapter(config.sourceId);
        if (!adapter) {
          sourcesFailed++;
          return {
            source: config.sourceId,
            sourceName: config.name,
            tier: config.tier,
            healthStatus: 'disabled',
            results: [],
            error: '书源不可用',
          };
        }
        const results = await adapter.search(query.trim());
        const responseTime = Date.now() - start;
        totalResults += results.length;

        // 记录搜索日志
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

    const sources = await Promise.all(promises);

    return {
      query: query.trim(),
      sources,
      summary: {
        totalResults,
        sourcesSearched: sorted.length,
        sourcesFailed,
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
