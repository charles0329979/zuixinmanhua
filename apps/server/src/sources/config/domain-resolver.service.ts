import { Injectable, Logger } from '@nestjs/common';
import { SourceConfigService, DomainEntry } from './source-config.service';

/**
 * DomainResolverService — 域名池故障转移
 * 为每个书源解析一个可用的域名，按 priority 遍历域名池
 * 结果缓存 60 秒
 */
@Injectable()
export class DomainResolverService {
  private readonly logger = new Logger(DomainResolverService.name);
  private cache = new Map<string, { url: string; expiresAt: number }>();

  constructor(private readonly configService: SourceConfigService) {}

  /** 解析一个可用的域名 */
  async resolveWorkingDomain(sourceId: string): Promise<string> {
    // Check TTL cache
    const cached = this.cache.get(sourceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const domains = this.configService.getDomainPool(sourceId);
    if (domains.length === 0) {
      throw new Error(`书源 "${sourceId}" 没有可用域名`);
    }

    // Try each domain in priority order with HEAD check
    for (const domain of domains) {
      const start = Date.now();
      try {
        const { default: axios } = await import('axios');
        await axios.head(domain.url + '/', {
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          validateStatus: (s) => s < 500,
        });
        const responseTime = Date.now() - start;
        this.configService.recordDomainResult(domain.id, true, responseTime);
        this.setCache(sourceId, domain.url);
        return domain.url;
      } catch (e: any) {
        const responseTime = Date.now() - start;
        // Don't count HEAD failures as definitive — many sites block HEAD
        this.logger.debug(`HEAD 检测失败 ${domain.url}: ${e.message?.slice(0, 60)}`);
        continue;
      }
    }

    // All HEAD checks failed — fallback to first domain anyway
    // The actual adapter will use GET requests which may succeed
    const fallback = domains[0].url;
    this.logger.warn(`⚠️ ${sourceId}: 所有域名 HEAD 检测失败，回退到 ${fallback}`);
    this.setCache(sourceId, fallback);
    return fallback;
  }

  /** 切换当前 active 域名（用于手动/自动切换） */
  async switchToNextDomain(sourceId: string): Promise<string> {
    this.cache.delete(sourceId);
    const domains = this.configService.getDomainPool(sourceId);
    // Move first domain to end (round-robin)
    if (domains.length > 1) {
      // Skip the failed first domain, try the next one
      const nextDomain = domains.slice(1).find((d) => d.isActive);
      if (nextDomain) {
        this.setCache(sourceId, nextDomain.url);
        this.logger.log(`🔄 ${sourceId} 切换到域名: ${nextDomain.url}`);
        return nextDomain.url;
      }
    }
    // Fallback to normal resolution
    return this.resolveWorkingDomain(sourceId);
  }

  /** 清除缓存 */
  clearCache(sourceId?: string): void {
    if (sourceId) {
      this.cache.delete(sourceId);
    } else {
      this.cache.clear();
    }
  }

  private setCache(sourceId: string, url: string): void {
    this.cache.set(sourceId, { url, expiresAt: Date.now() + 60_000 }); // 60s TTL
  }
}
