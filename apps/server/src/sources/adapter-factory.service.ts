import { Injectable, Logger } from '@nestjs/common';
import { SourceAdapter, AdapterContext } from './adapter.interface';
import { SourceConfigService } from './config/source-config.service';
import { DomainResolverService } from './config/domain-resolver.service';
import { ManwaAdapter } from './adapters/manwa';
import { YemanAdapter } from './adapters/yeman';
import { CopyAdapter } from './adapters/copy';
import { BaoziAdapter } from './adapters/baozi';
import { DongmanZhijiaAdapter } from './adapters/dongmanzhijia';

/**
 * AdapterFactoryService — 从数据库配置 + 域名池动态创建适配器实例
 */
@Injectable()
export class AdapterFactoryService {
  private readonly logger = new Logger(AdapterFactoryService.name);
  private instanceCache = new Map<string, { adapter: SourceAdapter; expiresAt: number }>();

  constructor(
    private readonly configService: SourceConfigService,
    private readonly domainResolver: DomainResolverService,
  ) {}

  /** 获取一个已注入上下文的适配器实例 */
  async create(sourceId: string): Promise<SourceAdapter> {
    // Check cache
    const cached = this.instanceCache.get(sourceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.adapter;
    }

    const config = this.configService.getConfig(sourceId);
    if (!config) throw new Error(`书源 "${sourceId}" 未配置`);
    if (!config.enabled) throw new Error(`书源 "${sourceId}" 已停用`);

    // 从域名池解析可用域名
    const baseUrl = await this.domainResolver.resolveWorkingDomain(sourceId);
    const { timeout, userAgent, retries } = config.requestConfig;

    const ctx: AdapterContext = {
      baseUrl,
      timeout,
      userAgent,
      retries,
      domainResolver: this.domainResolver,
    };

    const adapter = this.instantiate(sourceId, ctx);
    this.instanceCache.set(sourceId, { adapter, expiresAt: Date.now() + 30_000 });
    this.logger.debug(`🔧 创建适配器: ${sourceId} -> ${baseUrl}`);
    return adapter;
  }

  /** 获取所有已启用书源的适配器 */
  async createAllEnabled(): Promise<SourceAdapter[]> {
    const configs = this.configService.getEnabledSources();
    const adapters: SourceAdapter[] = [];

    for (const config of configs) {
      try {
        const adapter = await this.create(config.sourceId);
        adapters.push(adapter);
      } catch (e: any) {
        this.logger.warn(`跳过书源 ${config.name}: ${e.message}`);
      }
    }

    return adapters;
  }

  /** 清除实例缓存 */
  clearCache(sourceId?: string): void {
    if (sourceId) {
      this.instanceCache.delete(sourceId);
    } else {
      this.instanceCache.clear();
    }
    this.domainResolver.clearCache(sourceId);
  }

  private instantiate(sourceId: string, ctx: AdapterContext): SourceAdapter {
    switch (sourceId) {
      case 'manwa': return new ManwaAdapter(ctx);
      case 'yeman': return new YemanAdapter(ctx);
      case 'copy': return new CopyAdapter(ctx);
      case 'baozi': return new BaoziAdapter(ctx);
      case 'dongmanzhijia': return new DongmanZhijiaAdapter(ctx);
      default: throw new Error(`未知适配器: ${sourceId}`);
    }
  }
}
