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
import { SyncModule } from './sync/sync.module';
import { RuleBasedController } from './sources/rule-based.controller';
import { RuleSourceAdminController } from './sources/rule-source-admin.controller';

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
    SyncModule,
  ],
  controllers: [RuleBasedController, RuleSourceAdminController],
})
export class AppModule {}
