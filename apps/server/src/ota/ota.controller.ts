// ============================================================
// apps/server/src/ota/ota.controller.ts
// ★ OTA Controller — 源规则下发 (供 Mobile 自主同步)
// V4: 新增 channel 过滤 (stable/all)，stable 从 data/source-registry/stable/ 读取
// ============================================================

import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { SourceStoreService } from '../sources/source-store.service';
import { SourceReleaseService } from '../modules/source-import/registry/source-stable-store.service';
import * as fs from 'fs';
import * as path from 'path';

interface StableRelease {
  id: string; name: string; version: string; channel: 'stable';
  status: string; healthScore: number; origin: Record<string, unknown>;
  publishedAt: string; hash: string; capabilities: Record<string, boolean>;
  source: any;
}

@Controller('ota')
export class OtaController {
  private readonly logger = new Logger(OtaController.name);
  private readonly stableDir: string;
  private readonly manifestsDir: string;

  constructor(
    private readonly sourceStore: SourceStoreService,
    private readonly releaseService: SourceReleaseService,
  ) {
    this.stableDir = path.join(process.cwd(), 'data', 'source-registry', 'stable');
    this.manifestsDir = path.join(process.cwd(), 'data', 'source-registry', 'manifests');
  }

  /**
   * GET /api/ota/manifest
   * Registry manifest — version info, source count, index URL
   */
  @Get('manifest')
  getManifest(@Query('channel') channel?: string) {
    const stableIndex = this.readStableIndex();
    const allSources = this.sourceStore.getAll();

    return {
      name: 'comic-source-registry',
      version: '2026.06.28',
      updatedAt: stableIndex.generatedAt || new Date().toISOString(),
      sourceCount: channel === 'stable' ? stableIndex.total : allSources.length,
      enabledCount: channel === 'stable' ? stableIndex.total : allSources.filter(s => s.enabled).length,
      minClientVersion: '2.0.0',
      indexUrl: '/api/ota/index',
      channels: { stable: stableIndex.total, all: allSources.length },
    };
  }

  /**
   * GET /api/ota/index?channel=stable|all
   *
   * channel=stable: 仅返回通过全链路验证的源
   * channel=all (默认): 返回所有源 (旧行为)
   */
  @Get('index')
  getIndex(@Query('channel') channel?: string) {
    if (channel === 'stable') {
      const idx = this.readStableIndex();
      idx.sources.sort((a: any, b: any) => (b.healthScore || 0) - (a.healthScore || 0));
      return {
        version: '2026.06.28',
        channel: 'stable',
        updatedAt: idx.generatedAt || new Date().toISOString(),
        sources: idx.sources,
      };
    }
    // all channel: 向后兼容 sources.json
    const sources = this.sourceStore.getAll();
    return {
      version: '2026.06.28', channel: 'all',
      updatedAt: new Date().toISOString(),
      sources: sources.map(s => ({
        id: s.id, name: s.name, host: s.host,
        version: (s as any).updatedAt || '1.0.0',
        language: s.language, weight: s.weight,
        riskLevel: 'medium' as const,
        enabledByDefault: s.enabled,
        channel: 'all' as const,
        url: `/api/ota/source/${s.id}`,
      })),
    };
  }

  /**
   * GET /api/ota/source/:id
   * Individual source rule definition (full JSON)
   * V4: 优先从 stable 目录查找
   */
  @Get('source/:id')
  getSource(@Param('id') id: string) {
    // 只从 stable/ 目录读取 — 绝不下发 candidate/quarantine/manual-review
    const r = this.releaseService.getRelease(id);
    if (r) {
      return { ...r.source, version: r.version, channel: 'stable', status: 'PROMOTED', healthScore: r.healthScore, origin: r.origin, hash: r.hash, capabilities: r.capabilities, publishedAt: r.publishedAt };
    }
    // fallback: sourceStore (baozi, YYDS等已有可用源)
    return this.sourceStore.getById(id) || { error: 'Source not found', id };
  }

  /**
   * GET /api/ota/check?since=<ISO timestamp>
   * Check for source updates since a given time
   */
  @Get('check')
  checkUpdates(@Query('since') since?: string) {
    const sinceDate = since || '2026-06-15';
    const idx = this.readStableIndex();
    const updatedStable = (idx.sources as any[] || []).filter((s: any) => s.publishedAt > sinceDate);
    return { hasUpdates: updatedStable.length > 0, stableUpdates: updatedStable.length, updatedIds: updatedStable.map((s: any) => s.id) };
  }

  // ========== Private ==========

  private readStableIndex(): { generatedAt?: string; total: number; sources: any[] } {
    try {
      const p = path.join(this.manifestsDir, 'stable-index.json');
      if (!fs.existsSync(p)) return { total: 0, sources: [] };
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { return { total: 0, sources: [] }; }
  }
}
