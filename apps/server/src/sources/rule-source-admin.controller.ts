// ============================================================
// sources/rule-source-admin.controller.ts
// 规则书源管理 — 导入、检测、同步 (V6: 搜索通过 source-platform)
// ============================================================

import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { SourcePlatformService } from '../source-platform/source-platform.service';
import { DriverRegistryService } from '../source-platform/runtime/driver-registry.service';
import { SourceStoreService } from './source-store.service';
import { sourceStore } from './source-store';
import { importComicfsDir } from './comicfs-importer';
import { fetchAndImport } from './legado-importer';
import * as path from 'path';
import * as fs from 'fs';

@Controller('rule-sources')
export class RuleSourceAdminController {
  private readonly logger = new Logger(RuleSourceAdminController.name);

  constructor(
    private readonly sourceStoreService: SourceStoreService,
    private readonly platform: SourcePlatformService,
    private readonly driverRegistry: DriverRegistryService,
  ) {}

  /** GET /api/rule-sources — 所有规则源列表 */
  @Get()
  getAll() {
    const sources = this.sourceStoreService.getAll();
    return {
      total: sources.length,
      enabled: sources.filter(s => s.enabled).length,
      sources: sources.map(s => ({
        id: s.id, name: s.name, host: s.host, enabled: s.enabled,
        language: s.language, weight: s.weight,
        mode: s.mode || 'server', responseType: s.search.responseType || 'html',
      })),
    };
  }

  /** POST /api/rule-sources/import-local */
  @Post('import-local')
  importLocal() {
    const current = this.sourceStoreService.getAll();
    const dirs = [
      path.join(process.cwd(), '..', 'web', 'public', 'comicfs-data', 'sources'),
      path.join(process.cwd(), 'public', 'comicfs-data', 'sources'),
      path.join(process.cwd(), 'data', 'comicfs-sources'),
    ];
    let dir = '';
    for (const d of dirs) { if (fs.existsSync(d)) { dir = d; break; } }

    let imported = 0;
    if (dir) {
      const comicfsSources = importComicfsDir(dir);
      imported = sourceStore.importSources(comicfsSources as any);
    }

    const allAfter = this.sourceStoreService.getAll();
    return {
      ok: true, before: current.length, comicfsImported: imported,
      total: allAfter.length, enabled: allAfter.filter(s => s.enabled).length,
      message: `成功导入 ${imported} 个书源到 sources.json`,
    };
  }

  /** POST /api/rule-sources/check-all — 通过 SourcePlatformService 批量检测 */
  @Post('check-all')
  async checkAll() {
    const sources = this.sourceStoreService.getEnabled();
    const toCheck = sources.slice(0, 20);
    const results: any[] = [];

    for (const source of toCheck) {
      const start = Date.now();
      try {
        const searchResults = await this.platform.searchOne(source.id, '海贼王');
        results.push({
          id: source.id, name: source.name, host: source.host,
          ok: true, resultCount: searchResults.length, responseTimeMs: Date.now() - start,
        });
      } catch (e: any) {
        results.push({
          id: source.id, name: source.name, host: source.host,
          ok: false, error: e.message?.slice(0, 200), responseTimeMs: Date.now() - start,
        });
      }
    }

    const ok = results.filter(r => r.ok).length;
    return { checked: results.length, totalEnabled: sources.length, ok, fail: results.length - ok, results };
  }

  /** POST /api/rule-sources/enable-healthy */
  @Post('enable-healthy')
  enableHealthy() {
    const sources = this.sourceStoreService.getAll();
    let enabled = 0;
    for (const s of sources) {
      const risk = (s as any).riskLevel || (s.tags || []).find((t: string) => t === 'low' || t === 'medium' || t === 'high') || '';
      if ((!risk || risk === 'low') && !s.enabled) {
        sourceStore.toggleSource(s.id);
        enabled++;
      }
    }
    return { ok: true, enabled };
  }

  /** POST /api/rule-sources/legado/fetch */
  @Post('legado/fetch')
  async fetchLegado(@Body() body: { url?: string; filterType?: number }) {
    const url = body.url || 'https://raw.githubusercontent.com/jiwangyihao/source-j-legado/master/zaimanhua.json';
    const result = await fetchAndImport(url, body.filterType);
    return { ok: true, ...result, url };
  }

  /** POST /api/rule-sources/legado/import-json */
  @Post('legado/import-json')
  async importLegadoJson(@Body() body: { sources: any[] }) {
    const { convertLegadoToMangaSource } = await import('./legado-importer');
    const converted: any[] = [];
    for (const raw of body.sources || []) {
      const src = convertLegadoToMangaSource(raw);
      if (src) converted.push(src);
    }
    if (converted.length > 0) sourceStore.importSources(converted);
    return { ok: true, imported: converted.length };
  }

  /** GET /api/rule-sources/stats */
  @Get('stats')
  getStats() {
    const sources = this.sourceStoreService.getAll();
    const enabled = sources.filter(s => s.enabled).length;
    const serverMode = sources.filter(s => s.mode !== 'client' && s.enabled).length;
    const clientMode = sources.filter(s => s.mode === 'client' && s.enabled).length;
    return {
      total: sources.length, enabled, disabled: sources.length - enabled,
      serverMode, clientMode,
      languages: [...new Set(sources.map(s => s.language))],
    };
  }
}
