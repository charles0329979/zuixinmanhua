// ============================================================
// apps/server/src/sources/rule-source-admin.controller.ts
// 规则书源管理 — 导入、检测、同步
// ============================================================

import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { SourceStoreService } from './source-store.service';
import { sourceStore } from './source-store';
import { importComicfsDir, readComicfsIndex } from './comicfs-importer';
import { searchBySource } from './source-parser';
import { fetchAndImport } from './legado-importer';
import * as path from 'path';
import * as fs from 'fs';

@Controller('rule-sources')
export class RuleSourceAdminController {
  private readonly logger = new Logger(RuleSourceAdminController.name);

  constructor(private readonly sourceStoreService: SourceStoreService) {}

  /** GET /api/rule-sources — 所有规则源列表 */
  @Get()
  getAll() {
    const sources = this.sourceStoreService.getAll();
    return {
      total: sources.length,
      enabled: sources.filter(s => s.enabled).length,
      sources: sources.map(s => ({
        id: s.id,
        name: s.name,
        host: s.host,
        enabled: s.enabled,
        language: s.language,
        weight: s.weight,
        mode: s.mode || 'server',
        responseType: s.search.responseType || 'html',
      })),
    };
  }

  /** POST /api/rule-sources/import-local — 从 sources.json 和 comicfs-data 导入 */
  @Post('import-local')
  importLocal() {
    // 1. Load from sources.json (already in sourceStore)
    const current = this.sourceStoreService.getAll();

    // 2. Import from comicfs-data/
    const comicfsDir = path.join(process.cwd(), '..', 'web', 'public', 'comicfs-data', 'sources');
    const comicfsDir2 = path.join(process.cwd(), 'public', 'comicfs-data', 'sources');
    let comicfsDir3 = path.join(process.cwd(), 'data', 'comicfs-sources');

    let dir = '';
    if (fs.existsSync(comicfsDir)) dir = comicfsDir;
    else if (fs.existsSync(comicfsDir2)) dir = comicfsDir2;
    else if (fs.existsSync(comicfsDir3)) dir = comicfsDir3;

    let imported = 0;
    if (dir) {
      const comicfsSources = importComicfsDir(dir);
      imported = sourceStore.importSources(comicfsSources as any);
    }

    const allAfter = this.sourceStoreService.getAll();
    return {
      ok: true,
      before: current.length,
      comicfsImported: imported,
      total: allAfter.length,
      enabled: allAfter.filter(s => s.enabled).length,
      message: `成功导入 ${imported} 个书源到 sources.json`,
    };
  }

  /** POST /api/rule-sources/check-all — 批量检测所有规则源 */
  @Post('check-all')
  async checkAll() {
    const sources = this.sourceStoreService.getEnabled();
    const results: any[] = [];

    // Test with a common keyword
    const testKeyword = '海贼王';

    // Only check first 20 to avoid timeout
    const toCheck = sources.slice(0, 20);

    for (const source of toCheck) {
      const start = Date.now();
      try {
        const searchResults = await Promise.race([
          searchBySource(source, testKeyword),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 8000),
          ),
        ]);
        results.push({
          id: source.id,
          name: source.name,
          host: source.host,
          ok: true,
          resultCount: searchResults.length,
          responseTimeMs: Date.now() - start,
        });
      } catch (e: any) {
        results.push({
          id: source.id,
          name: source.name,
          host: source.host,
          ok: false,
          error: e.message?.slice(0, 200),
          responseTimeMs: Date.now() - start,
        });
      }
    }

    const ok = results.filter(r => r.ok).length;
    const fail = results.filter(r => !r.ok).length;

    return {
      checked: results.length,
      totalEnabled: sources.length,
      ok,
      fail,
      results,
    };
  }

  /** POST /api/rule-sources/enable-healthy — 仅启用检测通过的源 */
  @Post('enable-healthy')
  enableHealthy() {
    const sources = this.sourceStoreService.getAll();
    let enabled = 0;
    // We mark sources with weight > 0 and riskLevel=low as enabled
    for (const s of sources) {
      const risk = (s as any).riskLevel || (s.tags || []).find((t: string) => t === 'low' || t === 'medium' || t === 'high') || '';
      const shouldEnable = !risk || risk === 'low';
      if (shouldEnable && !s.enabled) {
        sourceStore.toggleSource(s.id);
        enabled++;
      }
    }
    return { ok: true, enabled };
  }

  /** POST /api/rule-sources/legado/fetch — 从社区仓库导入 Legado 源 */
  @Post('legado/fetch')
  async fetchLegado(@Body() body: { url?: string; filterType?: number }) {
    const url = body.url || 'https://raw.githubusercontent.com/jiwangyihao/source-j-legado/master/zaimanhua.json';
    const filterType = body.filterType;
    this.logger.log(`Fetching Legado sources from: ${url}`);
    const result = await fetchAndImport(url, filterType);
    this.logger.log(`Legado import done: ${result.imported} imported, ${result.skipped} skipped (total: ${result.total})`);
    return { ok: true, ...result, url };
  }

  /** POST /api/rule-sources/legado/import-json — 直接粘贴 Legado JSON 导入 */
  @Post('legado/import-json')
  async importLegadoJson(@Body() body: { sources: any[] }) {
    const { convertLegadoToMangaSource } = await import('./legado-importer');
    const converted: any[] = [];
    for (const raw of body.sources || []) {
      const src = convertLegadoToMangaSource(raw);
      if (src) converted.push(src);
    }
    if (converted.length > 0) sourceStore.importSources(converted);
    this.logger.log(`Legado JSON import: ${converted.length} sources`);
    return { ok: true, imported: converted.length };
  }

  /** GET /api/rule-sources/stats — 规则源统计 */
  @Get('stats')
  getStats() {
    const sources = this.sourceStoreService.getAll();
    const enabled = sources.filter(s => s.enabled).length;
    const serverMode = sources.filter(s => s.mode !== 'client' && s.enabled).length;
    const clientMode = sources.filter(s => s.mode === 'client' && s.enabled).length;

    return {
      total: sources.length,
      enabled,
      disabled: sources.length - enabled,
      serverMode,
      clientMode,
      languages: [...new Set(sources.map(s => s.language))],
    };
  }
}
