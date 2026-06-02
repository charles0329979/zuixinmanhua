import { Module } from '@nestjs/common';
import { SearchModule } from './search/search.module';
import { ComicModule } from './comic/comic.module';
import { ChapterModule } from './chapter/chapter.module';
import { SourcesModule } from './sources/sources.module';

@Module({
  imports: [SearchModule, ComicModule, ChapterModule, SourcesModule],
})
export class AppModule {}
