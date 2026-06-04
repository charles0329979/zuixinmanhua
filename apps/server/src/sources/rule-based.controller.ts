import { Controller, Get, Post, Put, Delete, Patch, Param, Body, Query } from '@nestjs/common';
import { sourceStore, MangaSource } from './source-store';
import { searchBySource, getDetailBySource, getChaptersBySource, getImagesBySource, aggregatedSearch } from './source-parser';

@Controller()
export class RuleBasedController {
  // ========== 书源 CRUD (规则化书源) ==========
  @Get('rule-sources')
  getSources() {
    return { success: true, data: sourceStore.getSources() };
  }

  @Post('rule-sources')
  createSource(@Body() body: MangaSource) {
    const s = sourceStore.createSource(body);
    return { success: true, data: s };
  }

  @Put('rule-sources/:id')
  updateSource(@Param('id') id: string, @Body() body: Partial<MangaSource>) {
    const s = sourceStore.updateSource(id, body);
    return s ? { success: true, data: s } : { success: false, message: '书源不存在' };
  }

  @Delete('rule-sources/:id')
  deleteSource(@Param('id') id: string) {
    const ok = sourceStore.deleteSource(id);
    return { success: ok, message: ok ? '已删除' : '书源不存在' };
  }

  @Patch('rule-sources/:id/toggle')
  toggleSource(@Param('id') id: string) {
    const s = sourceStore.toggleSource(id);
    return s ? { success: true, data: s } : { success: false, message: '书源不存在' };
  }

  @Post('rule-sources/import')
  importSources(@Body() body: { sources: MangaSource[] }) {
    const count = sourceStore.importSources(body.sources || []);
    return { success: true, data: { count }, message: `导入了 ${count} 个书源` };
  }

  @Get('rule-sources/export')
  exportSources() {
    return { success: true, data: sourceStore.exportSources() };
  }

  @Post('rule-sources/test')
  async testSource(@Body() body: { source: MangaSource }) {
    try {
      const results = await searchBySource(body.source, '海贼王');
      return { success: true, data: { resultCount: results.length, sample: results.slice(0, 3) } };
    } catch (e: any) {
      return { success: false, message: e.message || '测试失败' };
    }
  }

  // ========== 搜索 (规则化书源聚合搜索) ==========
  @Get('search-rule')
  async search(@Query('q') q: string) {
    if (!q) return { success: false, message: '缺少搜索关键词' };
    const sources = sourceStore.getEnabledSources();
    if (sources.length === 0) return { success: false, message: '没有启用的书源' };
    const result = await aggregatedSearch(q, sources);
    return { success: true, data: result };
  }

  // ========== 详情 + 章节 + 图片 (规则化书源) ==========
  @Post('comic-rule/detail')
  async comicDetail(@Body() body: { sourceId: string; detailUrl: string }) {
    const source = sourceStore.getSourceById(body.sourceId);
    if (!source) return { success: false, message: '书源不存在' };
    try {
      const detail = await getDetailBySource(source, body.detailUrl);
      return { success: true, data: { ...detail, sourceId: source.id, sourceName: source.name } };
    } catch (e: any) {
      return { success: false, message: e.message || '获取详情失败' };
    }
  }

  @Post('comic-rule/chapters')
  async comicChapters(@Body() body: { sourceId: string; detailUrl: string }) {
    const source = sourceStore.getSourceById(body.sourceId);
    if (!source) return { success: false, message: '书源不存在' };
    try {
      const chapters = await getChaptersBySource(source, body.detailUrl);
      return { success: true, data: chapters };
    } catch (e: any) {
      return { success: false, message: e.message || '获取章节失败' };
    }
  }

  @Post('comic-rule/images')
  async comicImages(@Body() body: { sourceId: string; chapterUrl: string }) {
    const source = sourceStore.getSourceById(body.sourceId);
    if (!source) return { success: false, message: '书源不存在' };
    try {
      const images = await getImagesBySource(source, body.chapterUrl);
      return { success: true, data: images };
    } catch (e: any) {
      return { success: false, message: e.message || '获取图片失败' };
    }
  }
}
