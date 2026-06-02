import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProxyService } from './proxy.service';

@Controller('proxy')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  /** GET /api/proxy/image?url=xxx&source=xxx */
  @Get('image')
  async proxyImage(
    @Query('url') url: string,
    @Query('source') source: string,
    @Res() res: Response,
  ) {
    if (!url || !source) {
      return res.status(400).json({ error: '缺少 url 或 source 参数' });
    }
    return this.proxyService.proxyImage(url, source, res);
  }
}
