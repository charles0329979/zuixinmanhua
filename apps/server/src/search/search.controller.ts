import { Controller, Get, Query, Param } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /api/search?q=xxx — 全源搜索 */
  @Get()
  async search(@Query('q') q: string) {
    if (!q) return { query: '', sources: [], summary: { totalResults: 0, sourcesSearched: 0, sourcesFailed: 0 } };
    return this.searchService.searchAll(q);
  }

  /** GET /api/search/:source?q=xxx — 单源搜索 */
  @Get(':source')
  async searchOne(@Param('source') source: string, @Query('q') q: string) {
    if (!q) return { source, results: [] };
    return this.searchService.searchOne(source, q);
  }
}
