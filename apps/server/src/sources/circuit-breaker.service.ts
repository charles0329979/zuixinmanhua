import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  SourceHealth,
  SourceHealthStatus,
  CircuitBreakerError,
} from './source-policy.types';

/**
 * CircuitBreakerService — 书源熔断器
 *
 * 规则:
 * 1. 检测到 403/429/验证码/百度重定向 → 立即标记为 blocked
 * 2. blocked 状态下不自动重试
 * 3. 熔断冷却时间默认 24h，可配置
 * 4. 管理员可手动恢复
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly db: DatabaseService) {}

  /** 记录成功 — 重置熔断状态 */
  recordSuccess(sourceId: string): void {
    this.db.run(
      `UPDATE source_configs
       SET health_status = 'healthy',
           consecutive_failures = 0,
           blocked_until = NULL,
           last_error = NULL,
           last_checked_at = datetime('now','localtime')
       WHERE source_id = ?`,
      [sourceId],
    );
  }

  /** 记录失败 — 递增失败计数，检测是否需要熔断 */
  recordFailure(sourceId: string, error: Error | string): void {
    const errorMsg = typeof error === 'string' ? error : error.message;
    const isCircuitBreaker = error instanceof CircuitBreakerError;

    const row = this.db.queryOne<{
      consecutive_failures: number;
      blocked_until: string | null;
      policy_config: string;
    }>(
      `SELECT consecutive_failures, blocked_until, policy_config
       FROM source_configs WHERE source_id = ?`,
      [sourceId],
    );

    if (!row) return;

    const newFailures = (row.consecutive_failures || 0) + 1;

    // 读取冷却时间配置
    let cooldownMs = 86_400_000; // 默认 24h
    try {
      const policy = JSON.parse(row.policy_config || '{}');
      if (policy.cooldownAfterBlockedMs) cooldownMs = policy.cooldownAfterBlockedMs;
    } catch { /* use default */ }

    // 熔断条件: CircuitBreakerError 或连续失败 >= 3
    const shouldBlock = isCircuitBreaker || newFailures >= 3;

    if (shouldBlock) {
      const blockedUntil = new Date(Date.now() + cooldownMs).toISOString();
      this.db.run(
        `UPDATE source_configs
         SET health_status = 'blocked',
             consecutive_failures = ?,
             blocked_until = ?,
             last_error = ?,
             last_checked_at = datetime('now','localtime')
         WHERE source_id = ?`,
        [newFailures, blockedUntil, errorMsg, sourceId],
      );
      this.logger.warn(`🔴 熔断: ${sourceId} -> blocked until ${blockedUntil} (${errorMsg.slice(0, 80)})`);
    } else {
      // 降级但未熔断
      const status = newFailures >= 2 ? 'degraded' : 'healthy';
      this.db.run(
        `UPDATE source_configs
         SET health_status = ?,
             consecutive_failures = ?,
             last_error = ?,
             last_checked_at = datetime('now','localtime')
         WHERE source_id = ?`,
        [status, newFailures, errorMsg, sourceId],
      );
      this.logger.debug(`⚠️  降级: ${sourceId} -> ${status} (${newFailures} failures)`);
    }
  }

  /** 检查是否处于熔断期 */
  isBlocked(sourceId: string): boolean {
    const row = this.db.queryOne<{
      health_status: string;
      blocked_until: string | null;
    }>(
      `SELECT health_status, blocked_until FROM source_configs WHERE source_id = ?`,
      [sourceId],
    );

    if (!row) return false;
    if (row.health_status !== 'blocked') return false;

    // 检查冷却是否结束
    if (row.blocked_until) {
      if (new Date(row.blocked_until) <= new Date()) {
        // 冷却结束，自动恢复
        this.db.run(
          `UPDATE source_configs
           SET health_status = 'unknown', blocked_until = NULL, consecutive_failures = 0
           WHERE source_id = ?`,
          [sourceId],
        );
        this.logger.log(`🟢 熔断冷却结束: ${sourceId} -> unknown`);
        return false;
      }
    }

    return true;
  }

  /** 检查是否可以重试（在 blocked 或 disabled 状态时返回 false） */
  canRetry(sourceId: string): boolean {
    const row = this.db.queryOne<{
      enabled: number;
      mode: string;
      health_status: string;
    }>(
      `SELECT enabled, mode, health_status FROM source_configs WHERE source_id = ?`,
      [sourceId],
    );

    if (!row) return false;
    if (!row.enabled) return false;
    if (row.mode === 'external-only') return false;
    if (this.isBlocked(sourceId)) return false;

    return true;
  }

  /** 管理员手动恢复 */
  manualRecover(sourceId: string): void {
    this.db.run(
      `UPDATE source_configs
       SET health_status = 'unknown',
           consecutive_failures = 0,
           blocked_until = NULL,
           last_error = NULL
       WHERE source_id = ?`,
      [sourceId],
    );
    this.logger.log(`🔄 手动恢复: ${sourceId}`);
  }

  /** 获取书源健康状态 */
  getHealth(sourceId: string): SourceHealth | null {
    const row = this.db.queryOne<{
      source_id: string;
      health_status: string;
      consecutive_failures: number;
      blocked_until: string | null;
      last_error: string | null;
      last_checked_at: string | null;
    }>(
      `SELECT source_id, health_status, consecutive_failures,
              blocked_until, last_error, last_checked_at
       FROM source_configs WHERE source_id = ?`,
      [sourceId],
    );

    if (!row) return null;

    return {
      sourceId: row.source_id,
      status: row.health_status as SourceHealthStatus,
      consecutiveFailures: row.consecutive_failures || 0,
      blockedUntil: row.blocked_until || undefined,
      lastError: row.last_error || undefined,
      lastCheckedAt: row.last_checked_at || undefined,
    };
  }

  /** 获取所有启用的 server-parser 模式书源 ID */
  getActiveServerParserIds(): string[] {
    const rows = this.db.query<{ source_id: string }>(
      `SELECT source_id FROM source_configs
       WHERE enabled = 1 AND mode = 'server-parser'`,
    );
    return (rows || []).map((r) => r.source_id).filter((id) => !this.isBlocked(id));
  }
}
