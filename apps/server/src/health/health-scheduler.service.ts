import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthService } from './health.service';
import { SourceConfigService } from '../sources/config/source-config.service';
import { CircuitBreakerService } from '../sources/circuit-breaker.service';

@Injectable()
export class HealthSchedulerService {
  private readonly logger = new Logger(HealthSchedulerService.name);

  constructor(
    private readonly healthService: HealthService,
    private readonly configService: SourceConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  // ========== 每 10 分钟: core 源快速检测 ==========
  @Cron('0 */10 * * * *')
  async checkCoreSources() {
    this.logger.log('⏰ 定时检测: core 书源');
    const configs = this.configService.getSourcesByTier('core').filter((c) => c.enabled);
    for (const config of configs) {
      try {
        await this.healthService.checkSource(config.sourceId);
      } catch (e: any) {
        this.logger.warn(`core 源 ${config.name} 检测失败: ${e.message}`);
      }
    }
  }

  // ========== 每 30 分钟: supplement 源 + blocked 恢复检测 ==========
  @Cron('0 */30 * * * *')
  async checkSupplementAndBlocked() {
    this.logger.log('⏰ 定时检测: supplement 书源 + blocked 恢复');

    // Supplement 源
    const suppConfigs = this.configService.getSourcesByTier('supplement').filter((c) => c.enabled);
    for (const config of suppConfigs) {
      try {
        await this.healthService.checkSource(config.sourceId);
      } catch (e: any) {
        this.logger.warn(`supplement 源 ${config.name} 检测失败: ${e.message}`);
      }
    }

    // Blocked 源恢复检测
    await this.checkBlockedRecovery();
  }

  // ========== 每 6 小时: 全量健康检查 ==========
  @Cron('0 0 */6 * * *')
  async fullHealthCheck() {
    this.logger.log('🏥 全量健康检查开始...');
    const allConfigs = this.configService.getAllConfigs().filter(
      (c) => c.enabled && c.tier !== 'disabled',
    );

    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let blocked = 0;

    for (const config of allConfigs) {
      try {
        const report = await this.healthService.checkSource(config.sourceId);
        switch (report.overallStatus) {
          case 'healthy':
            healthy++;
            break;
          case 'degraded':
            degraded++;
            break;
          case 'unhealthy':
            unhealthy++;
            break;
          case 'blocked':
            blocked++;
            break;
        }
      } catch (e: any) {
        unhealthy++;
        this.logger.error(`全量检测 ${config.name} 失败: ${e.message}`);
      }
    }

    this.logger.log(
      `🏥 全量健康检查完成: ${allConfigs.length} 个源 — ✅${healthy} ⚠️${degraded} ❌${unhealthy} 🚫${blocked}`,
    );
  }

  // ========== 每日 9:00: 健康日报 ==========
  @Cron('0 0 9 * * *')
  async dailyHealthReport() {
    this.logger.log('📊 生成每日健康报告...');

    try {
      const reports = await this.healthService.getAllHealth();
      const allConfigs = this.configService.getAllConfigs();

      const summary = {
        date: new Date().toISOString().split('T')[0],
        totalSources: allConfigs.length,
        enabled: allConfigs.filter((c) => c.enabled).length,
        disabled: allConfigs.filter((c) => !c.enabled).length,
        healthy: reports.filter((r) => r.overallStatus === 'healthy').length,
        degraded: reports.filter((r) => r.overallStatus === 'degraded').length,
        unhealthy: reports.filter((r) => r.overallStatus === 'unhealthy').length,
        blocked: reports.filter((r) => r.overallStatus === 'blocked').length,
        unknown: reports.filter((r) => r.overallStatus === 'unknown').length,
        details: reports
          .filter((r) => r.overallStatus !== 'healthy' && r.overallStatus !== 'unknown')
          .map((r) => ({
            id: r.sourceId,
            name: r.name,
            status: r.overallStatus,
            failedChecks: r.checks.filter((c) => !c.isHealthy).map((c) => c.checkType),
          })),
      };

      this.logger.log(
        `📊 健康日报: ${summary.healthy}/${summary.enabled} 健康` +
          (summary.degraded ? `, ${summary.degraded} 降级` : '') +
          (summary.unhealthy ? `, ${summary.unhealthy} 不健康` : '') +
          (summary.blocked ? `, ${summary.blocked} 熔断` : ''),
      );

      // Log unhealthy source details
      for (const detail of summary.details) {
        this.logger.warn(
          `  📛 ${detail.name} (${detail.id}): ${detail.status} — ${detail.failedChecks.join(', ')}`,
        );
      }

      return summary;
    } catch (e: any) {
      this.logger.error(`健康日报生成失败: ${e.message}`);
    }
  }

  // ========== 已过期源的垃圾回收 (每日 3:00) ==========
  @Cron('0 0 3 * * *')
  async cleanupStaleHealth() {
    // 可用于清理旧的健康检查日志
    this.logger.debug('🧹 清理过期健康检查数据');
  }

  // ========== 手动触发 ==========

  /** 立即执行全量健康检查 */
  async triggerFullCheck(): Promise<string> {
    await this.fullHealthCheck();
    return '全量健康检查已触发';
  }

  /** 立即生成健康报告 */
  async triggerDailyReport() {
    return this.dailyHealthReport();
  }

  /** Blocked 源恢复检测（可手动触发） */
  async checkBlockedRecovery() {
    const blockedSources = this.circuitBreaker.getAllBlockedSources();
    if (blockedSources.length === 0) return;

    this.logger.log(`🔄 检测 ${blockedSources.length} 个 blocked 源是否可恢复...`);
    for (const bs of blockedSources) {
      try {
        // 尝试轻量级检测（仅 homepage）
        const config = this.configService.getConfig(bs.sourceId);
        if (!config) continue;

        this.logger.debug(`  尝试恢复: ${config.name}`);
        await this.healthService.checkSource(bs.sourceId);
      } catch (e: any) {
        this.logger.debug(`  恢复失败: ${bs.sourceId} — ${e.message}`);
      }
    }
  }
}
