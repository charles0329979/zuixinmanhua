import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SourceConfigService } from '../sources/config/source-config.service';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  constructor(private readonly configService: SourceConfigService) {}

  /**
   * 流式转发图片，注入 Referer 和 User-Agent
   * 不存储图片到本地
   */
  async proxyImage(
    url: string,
    sourceId: string,
    res: any,
  ): Promise<void> {
    // 安全检查：只允许代理已注册书源域名下的图片
    if (!this.isAllowedDomain(url, sourceId)) {
      res.status(403).json({ error: '域名不在允许列表中' });
      return;
    }

    const config = this.configService.getConfig(sourceId);
    const requestConfig = config?.requestConfig || { userAgent: 'Mozilla/5.0' };

    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 15000,
        headers: {
          'User-Agent': requestConfig.userAgent || 'Mozilla/5.0',
          Referer: config?.domains[0]?.url || '',
        },
      });

      res.set({
        'Content-Type': response.headers['content-type'] || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });

      response.data.pipe(res);

      response.data.on('error', (e: any) => {
        this.logger.warn(`图片流错误: ${e.message}`);
        if (!res.headersSent) res.status(502).end();
      });
    } catch (e: any) {
      this.logger.warn(`图片代理失败 [${sourceId}]: ${url} — ${e.message}`);
      if (!res.headersSent) {
        res.status(502).json({ error: '图片加载失败', message: e.message?.slice(0, 200) });
      }
    }
  }

  private isAllowedDomain(url: string, sourceId: string): boolean {
    try {
      const host = new URL(url).hostname;
      const domains = this.configService.getDomainPool(sourceId);
      return domains.some((d) => {
        try {
          return new URL(d.url).hostname === host;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }
}
