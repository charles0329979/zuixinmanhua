import { Controller, Get, Query, Param } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /api/search?q=xxx — 全源搜索 */
  @Get()
  async search(@Query('q') q: string) {
    if (!q) return { sources: [] };
    const results = await this.searchService.searchAll(q);
    return { query: q, sources: results };
  }

  /** GET /api/search/:source?q=xxx — 单源搜索 */
  @Get(':source')
  async searchOne(@Param('source') source: string, @Query('q') q: string) {
    if (!q) return { source, results: [] };
    return this.searchService.searchOne(source, q);
  }
}
