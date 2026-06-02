import { Controller, Get, Post, Put, Delete, Param, Query, Body } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { SourceConfigService } from './config/source-config.service';

@Controller('sources')
export class SourcesController {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly configService: SourceConfigService,
  ) {}

  // ========== 基础操作 ==========

  /** GET /api/sources — 所有书源列表 */
  @Get()
  getAll() {
    return this.sourcesService.getAllSources();
  }

  /** GET /api/sources/:id/config — 书源完整配置 */
  @Get(':id/config')
  getConfig(@Param('id') id: string) {
    return this.configService.getConfig(id);
  }

  /** PUT /api/sources/:id/config — 更新请求配置 */
  @Put(':id/config')
  updateConfig(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    this.configService.updateRequestConfig(id, body);
    return { ok: true };
  }

  /** POST /api/sources/:id/toggle — 切换启用状态 */
  @Post(':id/toggle')
  toggle(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return { ok: this.sourcesService.toggleSource(id, body.enabled) };
  }

  /** PUT /api/sources/:id/tier — 设置层级 */
  @Put(':id/tier')
  setTier(@Param('id') id: string, @Body() body: { tier: string }) {
    return { ok: this.sourcesService.setTier(id, body.tier) };
  }

  // ========== 域名管理 ==========

  /** GET /api/sources/:id/domains — 域名池 */
  @Get(':id/domains')
  getDomains(@Param('id') id: string) {
    return this.sourcesService.getDomainPool(id);
  }

  /** POST /api/sources/:id/domains — 添加域名 */
  @Post(':id/domains')
  addDomain(@Param('id') id: string, @Body() body: { url: string; priority?: number }) {
    return this.sourcesService.addDomain(id, body.url, body.priority ?? 99);
  }

  /** DELETE /api/sources/:id/domains/:domainId — 删除域名 */
  @Delete(':id/domains/:domainId')
  removeDomain(@Param('id') id: string, @Param('domainId') domainId: string) {
    return { ok: this.sourcesService.removeDomain(id, parseInt(domainId)) };
  }

  // ========== 测试 ==========

  /** POST /api/sources/:id/test-search */
  @Post(':id/test-search')
  testSearch(@Param('id') id: string) {
    return this.sourcesService.testSearch(id);
  }

  /** POST /api/sources/:id/test-detail */
  @Post(':id/test-detail')
  testDetail(@Param('id') id: string, @Body() body: { comicId: string }) {
    return this.sourcesService.testDetail(id, body.comicId);
  }

  /** POST /api/sources/:id/test-chapter */
  @Post(':id/test-chapter')
  testChapter(@Param('id') id: string, @Body() body: { comicId: string }) {
    return this.sourcesService.testChapter(id, body.comicId);
  }
}
