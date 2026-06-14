// ============================================================
// apps/server/src/sync/sync.controller.ts
// ★ Sync API — 供 React Native App 调用
// 返回可用书源列表、规则定义、健康状态
// ============================================================

import { Controller, Get, Query, Logger } from '@nestjs/common';
import { SourceStoreService } from '../sources/source-store.service';
import { SourcesService } from '../sources/sources.service';

@Controller('api/sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private readonly sourceStore: SourceStoreService,
    private readonly sourcesService: SourcesService,
  ) {}

  /**
   * GET /api/sync/sources
   * 返回所有已启用源的规则定义，供 RN 端本地缓存
   */
  @Get('sources')
  getSources() {
    const ruleSources = this.sourceStore.getEnabled();
    const hardcodedSources = this.sourcesService.getAllSources();

    return {
      version: '2.0.0',
      updatedAt: new Date().toISOString(),
      sources: {
        hardcoded: hardcodedSources.map((s) => ({
          id: s.id,
          name: s.name,
          enabled: true,
          mode: s.mode,
        })),
        ruleBased: ruleSources.map((s) => ({
          id: s.id,
          name: s.name,
          host: s.host,
          language: s.language,
          weight: s.weight,
          enabled: s.enabled,
          search: s.search,
          detail: s.detail,
          chapters: s.chapters,
          images: s.images,
          headers: s.headers,
          timeoutMs: s.timeoutMs,
        })),
      },
      count: hardcodedSources.length + ruleSources.length,
    };
  }

  /**
   * GET /api/sync/sources/:id
   * 返回单个源的完整规则
   */
  @Get('source')
  getSource(@Query('id') id: string) {
    const ruleSource = this.sourceStore.getById(id);
    if (ruleSource) return ruleSource;

    const hcInfo = this.sourcesService.getAllSources().find((s) => s.id === id);
    if (hcInfo) return hcInfo;

    return { error: 'Source not found', id };
  }
}
