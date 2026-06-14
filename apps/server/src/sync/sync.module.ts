import { Module } from '@nestjs/common';
import { SourcesModule } from '../sources/sources.module';
import { SyncController } from './sync.controller';

@Module({
  imports: [SourcesModule],
  controllers: [SyncController],
})
export class SyncModule {}
