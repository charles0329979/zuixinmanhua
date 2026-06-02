import { Module } from '@nestjs/common';
import { ComicService } from './comic.service';
import { ComicController } from './comic.controller';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [SourcesModule],
  providers: [ComicService],
  controllers: [ComicController],
})
export class ComicModule {}
