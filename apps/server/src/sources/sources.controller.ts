import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { SourcesService } from './sources.service';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  /** GET /api/sources — 获取所有书源 */
  @Get()
  getAll() {
    return this.sourcesService.getAllSources();
  }

  /** POST /api/sources/:id/toggle — 切换书源启用状态 */
  @Post(':id/toggle')
  toggle(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return { ok: this.sourcesService.toggleSource(id, body.enabled) };
  }

  /** POST /api/sources/:id/test-search — 测试搜索 */
  @Post(':id/test-search')
  testSearch(@Param('id') id: string) {
    return this.sourcesService.testSearch(id);
  }

  /** POST /api/sources/:id/test-detail — 测试详情 */
  @Post(':id/test-detail')
  testDetail(@Param('id') id: string, @Body() body: { comicId: string }) {
    return this.sourcesService.testDetail(id, body.comicId);
  }

  /** POST /api/sources/:id/test-chapter — 测试章节 */
  @Post(':id/test-chapter')
  testChapter(@Param('id') id: string, @Body() body: { comicId: string }) {
    return this.sourcesService.testChapter(id, body.comicId);
  }
}
