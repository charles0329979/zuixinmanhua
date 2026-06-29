import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SourcePlatformModule } from '../source-platform/source-platform.module';

@Module({
  imports: [SourcePlatformModule],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
