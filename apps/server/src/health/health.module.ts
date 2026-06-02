import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthSchedulerService } from './health-scheduler.service';
import { HealthController } from './health.controller';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [SourcesModule],
  providers: [HealthService, HealthSchedulerService],
  controllers: [HealthController],
  exports: [HealthService],
})
export class HealthModule {}
