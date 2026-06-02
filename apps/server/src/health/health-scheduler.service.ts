import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealthService } from './health.service';
import { SourceConfigService } from '../sources/config/source-config.service';

@Injectable()
export class HealthSchedulerService {
  private readonly logger = new Logger(HealthSchedulerService.name);

  constructor(
    private readonly healthService: HealthService,
    private readonly configService: SourceConfigService,
  ) {}

  /** 每 10 分钟检测 core 源 */
  @Cron('0 */10 * * * *')
  async checkCoreSources() {
    this.logger.log('⏰ 定时检测: core 书源');
    const configs = this.configService.getSourcesByTier('core').filter((c) => c.enabled);
    for (const config of configs) {
      try { await this.healthService.checkSource(config.sourceId); } catch {}
    }
  }

  /** 每 30 分钟检测 supplement 源 */
  @Cron('0 */30 * * * *')
  async checkSupplementSources() {
    this.logger.log('⏰ 定时检测: supplement 书源');
    const configs = this.configService.getSourcesByTier('supplement').filter((c) => c.enabled);
    for (const config of configs) {
      try { await this.healthService.checkSource(config.sourceId); } catch {}
    }
  }

  /** 每 60 分钟检测 disabled 源（尝试恢复） */
  @Cron('0 0 * * * *')
  async checkDisabledSources() {
    this.logger.log('⏰ 定时检测: disabled 书源');
    const configs = this.configService.getSourcesByTier('disabled');
    for (const config of configs) {
      try { await this.healthService.checkSource(config.sourceId); } catch {}
    }
  }
}
