import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ProxyService } from './proxy.service';

@Controller('proxy')
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  /**
   * GET /api/proxy/image?url=xxx&source=xxx&refererBase=xxx
   *
   * @param url         图片原始 URL (必填)
   * @param source      书源 ID (可选, 用于查 Referer 映射)
   * @param refererBase 调用方指定的 Referer 基础域名 (可选, 最高优先)
   *                    规则源传这个参数可绕过防盗链
   */
  @Get('image')
  async proxyImage(
    @Query('url') url: string,
    @Query('source') source: string,
    @Query('refererBase') refererBase: string,
    @Res() res: Response,
  ) {
    if (!url) {
      return res.status(400).json({ error: 'PROXY_FAILED', reason: 'missing_url' });
    }
    await this.proxyService.proxyImage(url, source || '', refererBase, res);
  }
}
