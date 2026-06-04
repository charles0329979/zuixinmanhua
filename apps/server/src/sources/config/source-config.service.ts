import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface SourceConfigRow {
  source_id: string;
  name: string;
  tier: 'core' | 'supplement' | 'disabled';
  enabled: number;
  request_config: string; // JSON
  test_targets: string;   // JSON
  created_at: string;
  updated_at: string;
}

export interface DomainRow {
  id: number;
  source_id: string;
  url: string;
  priority: number;
  is_active: number;
  fail_count: number;
  success_count: number;
  avg_response_time_ms: number | null;
  last_check_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  note: string | null;
}

export interface SourceConfig {
  sourceId: string;
  name: string;
  tier: 'core' | 'supplement' | 'disabled';
  enabled: boolean;
  requestConfig: { timeout: number; userAgent: string; retries: number };
  testTargets: Record<string, string>;
  domains: DomainEntry[];
}

export interface DomainEntry {
  id: number;
  url: string;
  priority: number;
  isActive: boolean;
  failCount: number;
  successCount: number;
  note?: string;
}

@Injectable()
export class SourceConfigService {
  private readonly logger = new Logger(SourceConfigService.name);
  constructor(private readonly db: DatabaseService) {}

  /** 获取所有书源配置（含域名池） */
  getAllConfigs(): SourceConfig[] {
    const configs = this.db.query<SourceConfigRow>('SELECT * FROM source_configs ORDER BY tier, source_id');
    return configs.map((c) => this.rowToConfig(c));
  }

  /** 获取单个书源配置 */
  getConfig(sourceId: string): SourceConfig | null {
    const row = this.db.queryOne<SourceConfigRow>('SELECT * FROM source_configs WHERE source_id = ?', [sourceId]);
    if (!row) return null;
    return this.rowToConfig(row);
  }

  /** 获取域名池（按 priority 排序） */
  getDomainPool(sourceId: string): DomainEntry[] {
    const rows = this.db.query<DomainRow>(
      'SELECT * FROM source_domains WHERE source_id = ? AND is_active = 1 ORDER BY priority ASC',
      [sourceId],
    );
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      priority: r.priority,
      isActive: r.is_active === 1,
      failCount: r.fail_count,
      successCount: r.success_count,
      note: r.note ?? undefined,
    }));
  }

  /** 获取按 tier 筛选的书源 */
  getSourcesByTier(tier: string): SourceConfig[] {
    return this.getAllConfigs().filter((c) => c.tier === tier);
  }

  /** 获取所有启用的书源 */
  getEnabledSources(): SourceConfig[] {
    return this.getAllConfigs().filter((c) => c.enabled);
  }

  /** 切换启用状态 */
  toggleSource(sourceId: string, enabled: boolean): boolean {
    const existing = this.db.queryOne('SELECT source_id FROM source_configs WHERE source_id = ?', [sourceId]);
    if (!existing) return false;
    this.db.run('UPDATE source_configs SET enabled = ?, updated_at = datetime(\'now\',\'localtime\') WHERE source_id = ?', [
      enabled ? 1 : 0, sourceId,
    ]);
    return true;
  }

  /** 设置 tier */
  setTier(sourceId: string, tier: string): boolean {
    this.db.run('UPDATE source_configs SET tier = ?, updated_at = datetime(\'now\',\'localtime\') WHERE source_id = ?', [
      tier, sourceId,
    ]);
    return true;
  }

  /** 获取原始配置行（含新增字段） */
  getRawConfig(sourceId: string): SourceConfigRow | null {
    return this.db.queryOne<SourceConfigRow>(
      'SELECT * FROM source_configs WHERE source_id = ?',
      [sourceId],
    );
  }

  /** 设置运行模式 */
  setMode(sourceId: string, mode: string): boolean {
    this.db.run(
      'UPDATE source_configs SET mode = ?, updated_at = datetime(\'now\',\'localtime\') WHERE source_id = ?',
      [mode, sourceId],
    );
    return true;
  }

  /** 设置策略配置 */
  setPolicy(sourceId: string, policy: Record<string, unknown>): boolean {
    this.db.run(
      'UPDATE source_configs SET policy_config = ?, updated_at = datetime(\'now\',\'localtime\') WHERE source_id = ?',
      [JSON.stringify(policy), sourceId],
    );
    return true;
  }

  /** 添加域名 */
  addDomain(sourceId: string, url: string, priority: number): DomainEntry {
    this.db.run(
      'INSERT INTO source_domains (source_id, url, priority) VALUES (?, ?, ?)',
      [sourceId, url, priority],
    );
    const id = this.db.lastInsertRowId();
    return { id, url, priority, isActive: true, failCount: 0, successCount: 0 };
  }

  /** 删除域名 */
  removeDomain(sourceId: string, domainId: number): boolean {
    this.db.run('DELETE FROM source_domains WHERE id = ? AND source_id = ?', [domainId, sourceId]);
    return true;
  }

  /** 更新域名 fail/success 计数 */
  recordDomainResult(domainId: number, success: boolean, responseTimeMs: number, error?: string): void {
    if (success) {
      this.db.run(
        `UPDATE source_domains SET
          success_count = success_count + 1,
          avg_response_time_ms = COALESCE(avg_response_time_ms, ?) * 0.7 + ? * 0.3,
          last_success_at = datetime('now','localtime'),
          last_check_at = datetime('now','localtime'),
          fail_count = 0,
          last_error = NULL,
          updated_at = datetime('now','localtime')
        WHERE id = ?`,
        [responseTimeMs, responseTimeMs, domainId],
      );
    } else {
      this.db.run(
        `UPDATE source_domains SET
          fail_count = fail_count + 1,
          last_check_at = datetime('now','localtime'),
          last_error = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ?`,
        [error?.slice(0, 500) || 'Unknown error', domainId],
      );
    }
  }

  /** 更新请求配置 */
  updateRequestConfig(sourceId: string, config: Record<string, unknown>): void {
    this.db.run(
      'UPDATE source_configs SET request_config = ?, updated_at = datetime(\'now\',\'localtime\') WHERE source_id = ?',
      [JSON.stringify(config), sourceId],
    );
  }

  /** 获取活跃的请求配置 */
  getRequestConfig(sourceId: string): { timeout: number; userAgent: string; retries: number } {
    const row = this.db.queryOne<SourceConfigRow>('SELECT request_config FROM source_configs WHERE source_id = ?', [sourceId]);
    if (!row) return { timeout: 10000, userAgent: 'Mozilla/5.0', retries: 2 };
    try {
      const cfg = JSON.parse(row.request_config);
      return {
        timeout: cfg.timeout || 10000,
        userAgent: cfg.userAgent || 'Mozilla/5.0',
        retries: cfg.retries || 2,
      };
    } catch {
      return { timeout: 10000, userAgent: 'Mozilla/5.0', retries: 2 };
    }
  }

  private rowToConfig(row: SourceConfigRow): SourceConfig {
    let requestConfig = { timeout: 10000, userAgent: 'Mozilla/5.0', retries: 2 };
    let testTargets: Record<string, string> = {};
    try { requestConfig = JSON.parse(row.request_config); } catch {}
    try { testTargets = JSON.parse(row.test_targets); } catch {}

    return {
      sourceId: row.source_id,
      name: row.name,
      tier: row.tier as SourceConfig['tier'],
      enabled: row.enabled === 1,
      requestConfig,
      testTargets,
      domains: this.getDomainPool(row.source_id),
    };
  }
}
