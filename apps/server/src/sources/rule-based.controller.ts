// ============================================================
// sources/rule-based.controller.ts — LEGACY
//
// ★ V7: CRUD → SourceStoreService (NestJS injectable)
//    搜索/详情/章节/图片 → SourcePlatformService ✅
//    Client-mode parse → SourcePlatformService ✅
//    不再直接 import sourceStore / source-parser
// ============================================================

import { Controller, Get, Post, Put, Delete, Patch, Param, Body, Query } from '@nestjs/common';
import { SourcePlatformService } from '../source-platform/source-platform.service';
import { SourceStoreService } from './source-store.service';
import { MangaSource } from './source-store';

@Controller()
export class RuleBasedController {
  constructor(
    private readonly platform: SourcePlatformService,
    private readonly storeService: SourceStoreService,
  ) {}

  @Get('rule-sources')
  getSources() { return { success: true, data: this.storeService.getSources() }; }

  @Post('rule-sources')
  createSource(@Body() body: MangaSource) { const s = this.storeService.createSource(body); return { success: true, data: s }; }

  @Put('rule-sources/:id')
  updateSource(@Param('id') id: string, @Body() body: Partial<MangaSource>) { const s = this.storeService.updateSource(id, body); return s ? { success: true, data: s } : { success: false, message: '书源不存在' }; }

  @Delete('rule-sources/:id')
  deleteSource(@Param('id') id: string) { const ok = this.storeService.deleteSource(id); return { success: ok, message: ok ? '已删除' : '书源不存在' }; }

  @Patch('rule-sources/:id/toggle')
  toggleSource(@Param('id') id: string) { const s = this.storeService.toggleSource(id); return s ? { success: true, data: s } : { success: false, message: '书源不存在' }; }

  @Post('rule-sources/import')
  importSources(@Body() body: { sources: MangaSource[] }) { const count = this.storeService.importSources(body.sources || []); return { success: true, data: { count } }; }

  @Get('rule-sources/export')
  exportSources() { return { success: true, data: this.storeService.exportSources() }; }

  @Post('rule-sources/test')
  async testSource(@Body() body: { source: MangaSource }) {
    try { const results = await this.platform.searchOne(body.source.id, '海贼王'); return { success: true, data: { resultCount: results.length, sample: results.slice(0, 3) } }; }
    catch (e: any) { return { success: false, message: e.message || '测试失败' }; }
  }

  @Get('search-rule')
  async search(@Query('q') q: string) {
    if (!q) return { success: false, message: '缺少搜索关键词' };
    return { success: true, data: await this.platform.search(q) };
  }

  @Post('comic-rule/detail')
  async comicDetail(@Body() body: { sourceId: string; detailUrl: string }) {
    try { return { success: true, data: await this.platform.getDetail(body.sourceId, body.detailUrl) }; }
    catch (e: any) { return { success: false, message: e.message || '获取详情失败' }; }
  }

  @Post('comic-rule/chapters')
  async comicChapters(@Body() body: { sourceId: string; detailUrl: string }) {
    try { return { success: true, data: await this.platform.getChapters(body.sourceId, body.detailUrl) }; }
    catch (e: any) { return { success: false, message: e.message || '获取章节失败' }; }
  }

  @Post('comic-rule/images')
  async comicImages(@Body() body: { sourceId: string; chapterUrl: string }) {
    try { return { success: true, data: await this.platform.getImages(body.sourceId, '', body.chapterUrl) }; }
    catch (e: any) { return { success: false, message: e.message || '获取图片失败' }; }
  }

  // ★ Client-mode parse — 委托到 SourcePlatformService
  @Post('rule-parse/search')
  async parseSearch(@Body() body: { sourceId: string; html: string }) {
    try { return { success: true, data: await this.platform.parseSearch(body.sourceId, body.html) }; }
    catch (e: any) { return { success: false, message: e.message }; }
  }

  @Post('rule-parse/detail')
  async parseDetail(@Body() body: { sourceId: string; html: string }) {
    try { return { success: true, data: await this.platform.parseDetail(body.sourceId, body.html) }; }
    catch (e: any) { return { success: false, message: e.message }; }
  }

  @Post('rule-parse/chapters')
  async parseChapters(@Body() body: { sourceId: string; html: string }) {
    try { return { success: true, data: await this.platform.parseChapters(body.sourceId, body.html) }; }
    catch (e: any) { return { success: false, message: e.message }; }
  }

  @Post('rule-parse/images')
  async parseImages(@Body() body: { sourceId: string; html: string }) {
    try { return { success: true, data: await this.platform.parseImages(body.sourceId, body.html) }; }
    catch (e: any) { return { success: false, message: e.message }; }
  }
}
