import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { SearchModule } from './search/search.module';
import { ComicModule } from './comic/comic.module';
import { ChapterModule } from './chapter/chapter.module';
import { SourcesModule } from './sources/sources.module';
import { HealthModule } from './health/health.module';
import { ProxyModule } from './proxy/proxy.module';
import { LoggingModule } from './logging/logging.module';
import { RuleBasedController } from './sources/rule-based.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    SearchModule,
    ComicModule,
    ChapterModule,
    SourcesModule,
    HealthModule,
    ProxyModule,
    LoggingModule,
  ],
  controllers: [RuleBasedController],
})
export class AppModule {}
