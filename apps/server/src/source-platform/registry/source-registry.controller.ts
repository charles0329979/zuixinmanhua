// ============================================================
// source-platform/registry/source-registry.controller.ts
// Admin API — 源注册中心管理端点
//
// 端点:
//   GET  /api/admin/source-platform/stable
//   GET  /api/admin/source-platform/candidates
//   GET  /api/admin/source-platform/quarantine
//   GET  /api/admin/source-platform/manual-review
//   GET  /api/admin/source-platform/stats
//   POST /api/admin/source-platform/:id/promote
//   POST /api/admin/source-platform/:id/quarantine
// ============================================================

import { Controller, Get, Post, Param, Body, Logger } from '@nestjs/common';
import { SourceRegistryService, StableSourceEntry } from './source-registry.service';
import { DriverRegistryService } from '../runtime/driver-registry.service';
import { SourcePromotionService } from '../release/source-promotion.service';
import { SourceQuarantineService } from '../release/source-quarantine.service';
import { RollbackService } from '../release/rollback.service';
import { SourceValidationService } from '../validation/source-validation.service';

@Controller('admin/source-platform')
export class SourceRegistryController {
  private readonly logger = new Logger(SourceRegistryController.name);

  constructor(
    private readonly registry: SourceRegistryService,
    private readonly driverRegistry: DriverRegistryService,
    private readonly promotion: SourcePromotionService,
    private readonly quarantine: SourceQuarantineService,
    private readonly rollback: RollbackService,
    private readonly validation: SourceValidationService,
  ) {}

  // ============================================================
  // 查询
  // ============================================================

  /** GET /api/admin/source-platform/stats */
  @Get('stats')
  getStats() {
    return this.registry.getStats();
  }

  /** GET /api/admin/source-platform/stable */
  @Get('stable')
  getStable() {
    return this.registry.listStable();
  }

  /** GET /api/admin/source-platform/candidates */
  @Get('candidates')
  getCandidates() {
    return this.registry.listCandidates();
  }

  /** GET /api/admin/source-platform/quarantine */
  @Get('quarantine')
  getQuarantine() {
    return this.registry.listQuarantine();
  }

  /** GET /api/admin/source-platform/manual-review */
  @Get('manual-review')
  getManualReview() {
    return this.registry.listManualReview();
  }

  /** GET /api/admin/source-platform/drivers */
  @Get('drivers')
  getDrivers() {
    return this.driverRegistry.listAll().map(d => ({
      id: d.sourceId,
      name: d.sourceName,
      host: (d as any).host || '',
      capabilities: { search: true, detail: true, chapters: true, images: true },
    }));
  }

  // ============================================================
  // 操作
  // ============================================================

  /** POST /api/admin/source-platform/:id/validate
   *  使用 SourceValidationService 全链路验证，通过后自动 promote */
  @Post(':id/validate')
  async validateSource(@Param('id') id: string) {
    const result = await this.validation.validate(id);
    if (!result.ok) return result;

    // Auto-promote if recommended
    if (result.health?.recommendation === 'PROMOTE') {
      const driver = this.driverRegistry.getOptional(id);
      if (driver) {
        const entry: StableSourceEntry = {
          id: driver.sourceId,
          name: driver.sourceName,
          version: '1.0.0-' + Date.now().toString(36),
          hash: '',
          host: (driver as any).host || '',
          healthScore: result.health.total,
          publishedAt: new Date().toISOString(),
          capabilities: { search: true, detail: true, chapters: true, images: true } as Record<string, boolean>,
          origin: { provider: 'manual' },
        };
        this.promotion.promote(entry, result.health.total);
        result.status = 'PROMOTED';
      }
    }

    // Quarantine if failed
    if (result.health?.recommendation === 'QUARANTINE') {
      this.quarantine.quarantine({
        id, name: result.validation.driverName,
        reason: result.validation.errorMessage || 'Validation failed',
        quarantinedAt: new Date().toISOString(),
      });
      result.status = 'QUARANTINED';
    }

    return result;
  }

  /** POST /api/admin/source-platform/:id/promote
   *  ★ 必须先通过全链路验证。如未验证则自动触发验证。 */
  @Post(':id/promote')
  async promoteToStable(@Param('id') id: string) {
    const driver = this.driverRegistry.getOptional(id);
    if (!driver) return { ok: false, error: 'Driver not found', code: 'NOT_FOUND' };

    // ★ 强制验证 — candidate → stable 必须经过 SourceRuntime 全链路
    const result = await this.validation.validate(id);
    if (!result.ok || !result.health) {
      return { ok: false, error: 'Validation failed', detail: result };
    }

    if (result.health.recommendation !== 'PROMOTE') {
      return {
        ok: false,
        error: `Cannot promote: health=${result.health.total}, recommendation=${result.health.recommendation}`,
        validation: result.validation,
        health: result.health,
      };
    }

    const entry: StableSourceEntry = {
      id: driver.sourceId,
      name: driver.sourceName,
      version: '1.0.0-' + Date.now().toString(36),
      hash: '',
      host: (driver as any).host || '',
      healthScore: result.health.total,
      publishedAt: new Date().toISOString(),
      capabilities: { search: true, detail: true, chapters: true, images: true } as Record<string, boolean>,
      origin: { provider: 'manual' },
    };

    this.promotion.promote(entry, result.health.total);
    return { ok: true, entry, validation: result.validation, health: result.health };
  }

  /** POST /api/admin/source-platform/:id/demote */
  @Post(':id/demote')
  demoteFromStable(@Param('id') id: string) {
    this.promotion.unpublish(id);
    return { ok: true };
  }

  /** POST /api/admin/source-platform/:id/rollback */
  @Post(':id/rollback')
  rollbackSource(@Param('id') id: string) {
    const result = this.rollback.rollback(id);
    if (!result.ok) return { ok: false, error: result.reason, code: 'ROLLBACK_FAILED' };
    return { ok: true };
  }

  /** POST /api/admin/source-platform/:id/quarantine */
  @Post(':id/quarantine')
  quarantineSource(@Param('id') id: string, @Body() body: { reason?: string }) {
    const driver = this.driverRegistry.getOptional(id);
    if (!driver) return { ok: false, error: 'Driver not found' };

    this.quarantine.quarantine({
      id,
      name: driver.sourceName,
      host: (driver as any).host || '',
      reason: body?.reason || 'Manual quarantine',
      quarantinedAt: new Date().toISOString(),
    });
    this.promotion.unpublish(id);
    return { ok: true };
  }
}
