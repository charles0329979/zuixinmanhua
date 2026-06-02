import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { SourceConfigService } from '../sources/config/source-config.service';
import { DomainResolverService } from '../sources/config/domain-resolver.service';
import { DatabaseService } from '../database/database.service';
import { HealthChecker, CheckResult } from './health-checker.util';

export interface HealthReport {
  sourceId: string;
  name: string;
  tier: string;
  domain: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy' | 'disabled' | 'unknown';
  checks: CheckResult[];
  lastCheckAt: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly configService: SourceConfigService,
    private readonly domainResolver: DomainResolverService,
    private readonly db: DatabaseService,
  ) {}

  /** 检测单个书源的所有 5 项 */
  async checkSource(sourceId: string): Promise<HealthReport> {
    const config = this.configService.getConfig(sourceId);
    if (!config) throw new Error(`书源 ${sourceId} 不存在`);

    this.logger.log(`🏥 检测书源: ${config.name} (${config.tier})`);

    let adapter;
    try {
      adapter = await this.sourcesService.getAdapter(sourceId);
    } catch (e: any) {
      this.logger.warn(`跳过 ${config.name}: 无法创建适配器 (${e.message})`);
      // All checks fail - adapter creation failed
      const failedChecks = ['homepage', 'search', 'detail', 'chapter', 'image'].map((t) => ({
        checkType: t, isHealthy: false, responseTimeMs: 0,
        errorType: 'ADAPTER_ERROR', errorMessage: e.message?.slice(0, 300),
      }));
      this.writeHealthResults(sourceId, config.domains[0]?.url || '', failedChecks);
      return {
        sourceId, name: config.name, tier: config.tier,
        domain: config.domains[0]?.url || '',
        overallStatus: config.enabled ? 'unhealthy' : 'disabled',
        checks: failedChecks, lastCheckAt: new Date().toISOString(),
      };
    }

    // Run all 5 checks in parallel
    const [home, search, detail, chapter, image] = await Promise.all([
      HealthChecker.checkHomepage(adapter).catch((e) => ({ checkType: 'homepage', isHealthy: false, responseTimeMs: 0, errorMessage: e.message })),
      HealthChecker.checkSearch(adapter).catch((e) => ({ checkType: 'search', isHealthy: false, responseTimeMs: 0, errorMessage: e.message })),
      HealthChecker.checkDetail(adapter).catch((e) => ({ checkType: 'detail', isHealthy: false, responseTimeMs: 0, errorMessage: e.message })),
      HealthChecker.checkChapter(adapter).catch((e) => ({ checkType: 'chapter', isHealthy: false, responseTimeMs: 0, errorMessage: e.message })),
      HealthChecker.checkImage(adapter).catch((e) => ({ checkType: 'image', isHealthy: false, responseTimeMs: 0, errorMessage: e.message })),
    ]);

    const checks = [home, search, detail, chapter, image];
    this.writeHealthResults(sourceId, adapter.domain, checks);

    // Auto failover: if homepage+search both fail and there are backup domains
    const bothFailed = !home.isHealthy && !search.isHealthy;
    if (bothFailed) {
      try {
        const newDomain = await this.domainResolver.switchToNextDomain(sourceId);
        this.logger.warn(`🔄 ${config.name} 切换到备用域名: ${newDomain}`);
      } catch {}
    }

    const overall = this.computeOverallStatus(checks, config.enabled);
    return {
      sourceId, name: config.name, tier: config.tier,
      domain: adapter.domain, overallStatus: overall,
      checks, lastCheckAt: new Date().toISOString(),
    };
  }

  /** 获取所有书源的健康摘要 */
  async getAllHealth(): Promise<HealthReport[]> {
    const configs = this.configService.getAllConfigs();
    const reports: HealthReport[] = [];

    for (const config of configs) {
      const checks = this.getLatestHealthFromDB(config.sourceId);
      if (checks.length > 0) {
        reports.push({
          sourceId: config.sourceId,
          name: config.name,
          tier: config.tier,
          domain: config.domains[0]?.url || '',
          overallStatus: this.computeOverallStatus(checks, config.enabled),
          checks,
          lastCheckAt: checks[0]?.lastCheckAt || '',
        });
      } else {
        reports.push({
          sourceId: config.sourceId,
          name: config.name,
          tier: config.tier,
          domain: config.domains[0]?.url || '',
          overallStatus: config.enabled ? 'unknown' as const : 'disabled' as const,
          checks: [],
          lastCheckAt: '',
        });
      }
    }
    return reports;
  }

  /** 获取单个书源健康详情 */
  async getSourceHealth(sourceId: string): Promise<HealthReport | null> {
    const config = this.configService.getConfig(sourceId);
    if (!config) return null;
    const checks = this.getLatestHealthFromDB(sourceId);
    return {
      sourceId: config.sourceId,
      name: config.name,
      tier: config.tier,
      domain: config.domains[0]?.url || '',
      overallStatus: checks.length > 0 ? this.computeOverallStatus(checks, config.enabled) : 'unknown' as const,
      checks,
      lastCheckAt: checks[0]?.lastCheckAt || '',
    };
  }

  private writeHealthResults(sourceId: string, domain: string, checks: CheckResult[]): void {
    const config = this.configService.getConfig(sourceId);
    for (const check of checks) {
      this.db.run(
        `INSERT OR REPLACE INTO source_health_status
         (source_id, domain, check_type, is_healthy, status_code, response_time_ms, error_type, error_message, last_check_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
        [sourceId, domain, check.checkType, check.isHealthy ? 1 : 0, check.statusCode || null, check.responseTimeMs || 0, check.errorType || null, check.errorMessage?.slice(0, 500) || null],
      );
      this.db.run(
        `INSERT INTO source_check_logs (source_id, source_name, domain, check_type, is_healthy, status_code, response_time_ms, error_type, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sourceId, config?.name || '', domain, check.checkType, check.isHealthy ? 1 : 0, check.statusCode || null, check.responseTimeMs || 0, check.errorType || null, check.errorMessage?.slice(0, 500) || null],
      );
    }
  }

  private getLatestHealthFromDB(sourceId: string): any[] {
    const rows = this.db.query(
      'SELECT check_type, is_healthy, status_code, response_time_ms, error_type, error_message, last_check_at FROM source_health_status WHERE source_id = ?',
      [sourceId],
    );
    return rows.map((r) => ({
      checkType: r.check_type,
      isHealthy: r.is_healthy === 1,
      statusCode: r.status_code || undefined,
      responseTimeMs: r.response_time_ms || 0,
      errorType: r.error_type || undefined,
      errorMessage: r.error_message || undefined,
      lastCheckAt: r.last_check_at || '',
    }));
  }

  private computeOverallStatus(checks: any[], enabled: boolean): 'healthy' | 'degraded' | 'unhealthy' | 'disabled' | 'unknown' {
    if (!enabled || checks.length === 0) return 'disabled' as const;
    const allHealthy = checks.every((c: any) => c.isHealthy);
    const anyHealthy = checks.some((c: any) => c.isHealthy);
    if (allHealthy) return 'healthy';
    if (anyHealthy) return 'degraded';
    return 'unhealthy';
  }
}
