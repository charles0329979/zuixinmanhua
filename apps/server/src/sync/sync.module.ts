import { Module } from '@nestjs/common';
import { SourcePlatformModule } from '../source-platform/source-platform.module';
import { SyncController } from './sync.controller';

@Module({
  imports: [SourcePlatformModule],
  controllers: [SyncController],
})
export class SyncModule {}
