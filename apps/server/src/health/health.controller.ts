import { Controller, Get, Post, Param } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthSchedulerService } from './health-scheduler.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly scheduler: HealthSchedulerService,
  ) {}

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

  /** POST /api/health/:source/check — 手动触发单源检测 */
  @Post(':source/check')
  async checkOne(@Param('source') source: string) {
    return this.healthService.checkSource(source);
  }

  /** POST /api/health/check-all — 一键全量检测 */
  @Post('check-all')
  async checkAll() {
    await this.scheduler.triggerFullCheck();
    return { message: '全量健康检查已触发', timestamp: new Date().toISOString() };
  }

  /** POST /api/health/report — 手动生成日报 */
  @Post('report')
  async generateReport() {
    const report = await this.scheduler.triggerDailyReport();
    return { message: '日报已生成', report };
  }

  /** POST /api/health/recover-blocked — 手动触发 blocked 源恢复检测 */
  @Post('recover-blocked')
  async recoverBlocked() {
    await this.scheduler.checkBlockedRecovery();
    return { message: 'Blocked 源恢复检测已触发', timestamp: new Date().toISOString() };
  }
}
