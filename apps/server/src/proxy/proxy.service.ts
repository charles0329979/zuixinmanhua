import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SourceConfigService } from '../sources/config/source-config.service';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  constructor(private readonly configService: SourceConfigService) {}

  /**
   * 缓冲式转发图片，注入 Referer 和 User-Agent
   * 使用 arraybuffer 避免 chunked transfer 导致 RN Image 加载失败
   */
  async proxyImage(
    url: string,
    sourceId: string,
    res: any,
  ): Promise<void> {
    if (!this.isAllowedDomain(url, sourceId)) {
      res.status(403).json({ error: '域名不在允许列表中' });
      return;
    }

    const config = this.configService.getConfig(sourceId);
    const requestConfig = config?.requestConfig || { userAgent: 'Mozilla/5.0' };

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': requestConfig.userAgent || 'Mozilla/5.0',
          Referer: config?.domains[0]?.url || '',
        },
      });

      var ct = String(response.headers['content-type'] || '');
      // If CDN doesn't give a proper image Content-Type, guess from URL extension
      if (!ct || ct === 'binary/octet-stream' || ct.indexOf('image/') !== 0) {
        var urlLower = url.toLowerCase();
        if (urlLower.indexOf('.webp') !== -1) ct = 'image/webp';
        else if (urlLower.indexOf('.png') !== -1) ct = 'image/png';
        else if (urlLower.indexOf('.gif') !== -1) ct = 'image/gif';
        else ct = 'image/jpeg';
      }

      const buffer = Buffer.from(response.data);
      res.set({
        'Content-Type': ct,
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(buffer);
    } catch (e: any) {
      this.logger.warn(`图片代理失败 [${sourceId}]: ${url} — ${e.message}`);
      if (!res.headersSent) {
        res.status(502).json({ error: '图片加载失败', message: e.message?.slice(0, 200) });
      }
    }
  }

  private isAllowedDomain(_url: string, _sourceId: string): boolean {
    // P0: Allow all image domains (personal service, firewall-protected)
    return true;
  }
}
