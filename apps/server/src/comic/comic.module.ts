import { Module } from '@nestjs/common';
import { ComicService } from './comic.service';
import { ComicController } from './comic.controller';
import { SourcePlatformModule } from '../source-platform/source-platform.module';

@Module({
  imports: [SourcePlatformModule],
  providers: [ComicService],
  controllers: [ComicController],
})
export class ComicModule {}
