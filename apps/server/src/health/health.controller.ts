import { Controller, Get, Post, Param } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** GET /api/health — 所有书源健康摘要 */
  @Get()
  async getAll() {
    return this.healthService.getAllHealth();
  }

  /** GET /api/health/:source — 单源健康详情 */
  @Get(':source')
  async getOne(@Param('source') source: string) {
    return this.healthService.getSourceHealth(source);
  }

  /** POST /api/health/:source/check — 手动触发检测 */
  @Post(':source/check')
  async checkOne(@Param('source') source: string) {
    return this.healthService.checkSource(source);
  }

  /** POST /api/health/check-all — 一键检测所有 */
  @Post('check-all')
  async checkAll() {
    const { SourceConfigService } = await import('../sources/config/source-config.service');
    // We use the already-injected services via HealthService
    return { message: 'Use individual check endpoints' };
  }
}
