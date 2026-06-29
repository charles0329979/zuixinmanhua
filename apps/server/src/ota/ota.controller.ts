// ============================================================
// apps/server/src/ota/ota.controller.ts (V11)
// OTA Controller — 只读 ota-index.json
//
// candidate / quarantine / manual-review / disabled 绝不下发。
// ============================================================

import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { SourceRegistryService } from '../source-platform/registry/source-registry.service';
import { SourceManifestService } from '../source-platform/registry/source-manifest.service';

@Controller('ota')
export class OtaController {
  private readonly logger = new Logger(OtaController.name);

  constructor(
    private readonly registry: SourceRegistryService,
    private readonly manifest: SourceManifestService,
  ) {}

  /** GET /api/ota/manifest */
  @Get('manifest')
  getManifest() {
    const idx = this.manifest.getOtaIndex();
    return {
      name: 'comic-source-registry',
      version: idx.version,
      generatedAt: idx.generatedAt,
      sourceCount: idx.sources.length,
      indexUrl: '/api/ota/index',
    };
  }

  /** GET /api/ota/index — 只读 ota-index.json */
  @Get('index')
  getIndex() {
    const idx = this.manifest.getOtaIndex();
    return idx;
  }

  /** GET /api/ota/source/:id — 只读 registry/stable/ */
  @Get('source/:id')
  getSource(@Param('id') id: string) {
    const entry = this.registry.getStable(id);
    if (!entry) return { error: 'Source not found', id };

    const type = (entry.origin?.provider === 'adapter' ? 'adapter' : 'rule') as 'adapter' | 'rule';
    return {
      id: entry.id,
      name: entry.name,
      type,
      version: entry.version,
      hash: entry.hash,
      healthScore: entry.healthScore,
      capabilities: {
        search: entry.capabilities?.search ?? true,
        detail: entry.capabilities?.detail ?? true,
        chapters: entry.capabilities?.chapters ?? true,
        images: entry.capabilities?.images ?? true,
      },
      publishedAt: entry.publishedAt,
    };
  }

  /** GET /api/ota/check */
  @Get('check')
  checkUpdates(@Query('since') since?: string) {
    const sinceDate = since || '2026-06-15';
    const idx = this.manifest.getOtaIndex();
    const updated = idx.sources.filter(s => s.publishedAt > sinceDate);
    return {
      hasUpdates: updated.length > 0,
      stableUpdates: updated.length,
      updatedIds: updated.map(s => s.id),
    };
  }
}
