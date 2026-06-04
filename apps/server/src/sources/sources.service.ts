import { Injectable, Logger } from '@nestjs/common';
import { SourceAdapter } from './adapter.interface';
import { SourceConfigService } from './config/source-config.service';
import { AdapterFactoryService } from './adapter-factory.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private readonly configService: SourceConfigService,
    private readonly adapterFactory: AdapterFactoryService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /** 获取所有书源（含数据库配置 + 熔断状态） */
  getAllSources() {
    return this.configService.getAllConfigs().map((c) => {
      const health = this.circuitBreaker.getHealth(c.sourceId);
      return {
        id: c.sourceId,
        name: c.name,
        tier: c.tier,
        enabled: c.enabled,
        domain: c.domains[0]?.url || '',
        domainCount: c.domains.length,
        mode: (c as any).mode || 'server-parser',
        healthStatus: health?.status || 'unknown',
        blockedUntil: health?.blockedUntil,
        lastError: health?.lastError,
        requestConfig: c.requestConfig,
        policyConfig: (c as any).policyConfig || null,
      };
    });
  }

  /** 获取所有已启用的适配器实例（跳过 external-only 和 blocked） */
  async getEnabledAdapters(): Promise<SourceAdapter[]> {
    return this.adapterFactory.createAllEnabled();
  }

  /** 获取单个适配器实例（含熔断检查） */
  async getAdapter(id: string): Promise<SourceAdapter | undefined> {
    // 检查是否为 external-only 模式
    const config = this.configService.getConfig(id);
    if (!config || !config.enabled) return undefined;

    const row = this.configService.getRawConfig(id);
    const mode = (row as any)?.mode || 'server-parser';
    if (mode === 'external-only') {
      this.logger.debug(`跳过 external-only 书源: ${id}`);
      return undefined;
    }

    // 检查熔断状态
    if (this.circuitBreaker.isBlocked(id)) {
      this.logger.debug(`跳过已熔断书源: ${id}`);
      return undefined;
    }

    try {
      return await this.adapterFactory.create(id);
    } catch (e: any) {
      this.logger.warn(`无法创建适配器 ${id}: ${e.message}`);
      return undefined;
    }
  }

  /** 切换书源启用状态 */
  toggleSource(id: string, enabled: boolean) {
    const ok = this.configService.toggleSource(id, enabled);
    this.logger.log(`${enabled ? '✅' : '❌'} 书源 ${id}: ${enabled ? '启用' : '停用'}`);
    if (!enabled) this.adapterFactory.clearCache(id);
    return ok;
  }

  /** 设置书源 tier */
  setTier(id: string, tier: string) {
    return this.configService.setTier(id, tier);
  }

  /** 获取域名池 */
  getDomainPool(id: string) {
    return this.configService.getDomainPool(id);
  }

  /** 添加域名 */
  addDomain(id: string, url: string, priority: number) {
    return this.configService.addDomain(id, url, priority);
  }

  /** 删除域名 */
  removeDomain(id: string, domainId: number) {
    return this.configService.removeDomain(id, domainId);
  }

  /** 获取完整配置 */
  getSourceConfig(id: string) {
    return this.configService.getConfig(id);
  }

  /** 测试书源搜索 */
  async testSearch(id: string) {
    const adapter = await this.getAdapter(id);
    if (!adapter) throw new Error('书源不存在或已停用');
    const start = Date.now();
    try {
      const results = await adapter.search('海贼王');
      return { success: true, responseTime: Date.now() - start, resultCount: results.length };
    } catch (e: any) {
      return { success: false, responseTime: Date.now() - start, error: e.message };
    }
  }

  /** 测试书源详情 */
  async testDetail(id: string, comicId: string) {
    const adapter = await this.getAdapter(id);
    if (!adapter) throw new Error('书源不存在或已停用');
    const start = Date.now();
    try {
      const detail = await adapter.getComicDetail(comicId);
      return { success: true, responseTime: Date.now() - start, title: detail.title };
    } catch (e: any) {
      return { success: false, responseTime: Date.now() - start, error: e.message };
    }
  }

  /** 测试章节解析 */
  async testChapter(id: string, comicId: string) {
    const adapter = await this.getAdapter(id);
    if (!adapter) throw new Error('书源不存在或已停用');
    const start = Date.now();
    try {
      const chapters = await adapter.getChapters(comicId);
      return { success: true, responseTime: Date.now() - start, chapterCount: chapters.length };
    } catch (e: any) {
      return { success: false, responseTime: Date.now() - start, error: e.message };
    }
  }

  // ========== 策略与熔断管理 ==========

  /** 更新书源运行模式 */
  setMode(id: string, mode: string) {
    return this.configService.setMode(id, mode);
  }

  /** 更新书源策略配置 */
  setPolicy(id: string, policy: Record<string, unknown>) {
    return this.configService.setPolicy(id, policy);
  }

  /** 手动恢复熔断 */
  recoverSource(id: string) {
    this.circuitBreaker.manualRecover(id);
    this.adapterFactory.clearCache(id);
    return { ok: true };
  }

  /** 获取书源健康状态 */
  getSourceHealth(id: string) {
    return this.circuitBreaker.getHealth(id);
  }
}
