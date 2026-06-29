import { Module } from '@nestjs/common';
import { ChapterService } from './chapter.service';
import { ChapterController } from './chapter.controller';
import { SourcePlatformModule } from '../source-platform/source-platform.module';

@Module({
  imports: [SourcePlatformModule],
  providers: [ChapterService],
  controllers: [ChapterController],
})
export class ChapterModule {}
