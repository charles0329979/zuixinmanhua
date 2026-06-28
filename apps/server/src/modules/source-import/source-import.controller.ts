// ============================================================
// apps/server/src/modules/source-import/source-import.controller.ts
// Admin API — 源导入/验证/发布管理
// ============================================================

import { Controller, Get, Post, Param, Body, Logger } from '@nestjs/common';
import { SourceImportService } from './source-import.service';
import { RepositoryManifestService } from './discovery/repository-manifest.service';
import { SourceReleaseService } from './registry/source-stable-store.service';
import { SourceQuarantineService } from './registry/source-quarantine-store.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('admin/source-import')
export class SourceImportController {
  private readonly logger = new Logger(SourceImportController.name);
  private readonly reportsDir: string;
  private readonly manualReviewDir: string;

  constructor(
    private readonly service: SourceImportService,
    private readonly manifestService: RepositoryManifestService,
    private readonly releaseService: SourceReleaseService,
    private readonly quarantineService: SourceQuarantineService,
  ) {
    const root = path.join(process.cwd(), 'data', 'source-registry');
    this.reportsDir = path.join(root, 'reports', 'import-runs');
    this.manualReviewDir = path.join(root, 'manual-review');
  }

  // ============================================================
  // Repository sync
  // ============================================================

  /** POST /api/admin/source-import/repositories/:id/sync */
  @Post('repositories/:id/sync')
  async syncRepository(@Param('id') id: string) {
    try {
      const result = await this.service.syncRepository(id);
      if (!result.ok) return { ok: false, error: result.error, code: 'REPO_NOT_FOUND' };
      return { ok: true, report: result.report };
    } catch (e: any) {
      return { ok: false, error: e.message, code: 'SYNC_FAILED' };
    }
  }

  /** GET /api/admin/source-import/repositories */
  @Get('repositories')
  getRepositories() { return this.manifestService.getRepositories(); }

  /** GET /api/admin/source-import/runs */
  @Get('runs')
  getRuns() {
    if (!fs.existsSync(this.reportsDir)) return [];
    return fs.readdirSync(this.reportsDir).filter(f => f.endsWith('.json')).sort().slice(-50)
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(this.reportsDir, f), 'utf-8')); } catch { return null; } })
      .filter(Boolean);
  }

  // ============================================================
  // Source listing
  // ============================================================

  /** GET /api/admin/source-import/candidates */
  @Get('candidates')
  getCandidates() { return this.service.listCandidates(); }

  /** GET /api/admin/source-import/stable */
  @Get('stable')
  getStable() {
    const releases = this.releaseService.listAllStable();
    return { count: releases.length, sources: releases.map(r => ({ id: r.id, name: r.name, version: r.version, healthScore: r.healthScore, publishedAt: r.publishedAt, capabilities: r.capabilities })) };
  }

  /** GET /api/admin/source-import/quarantine */
  @Get('quarantine')
  getQuarantine() {
    return { stats: this.quarantineService.getStats(), sources: this.quarantineService.listAll().map(s => ({ id: s.id, name: s.name, lifecycleStatus: s.lifecycleStatus, health: s.health, warnings: s.conversionWarnings?.slice(-5) })) };
  }

  /** GET /api/admin/source-import/manual-review */
  @Get('review')
  getManualReview() {
    if (!fs.existsSync(this.manualReviewDir)) return [];
    return fs.readdirSync(this.manualReviewDir).filter(f => f.endsWith('.json'))
      .map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(this.manualReviewDir, f), 'utf-8')); return { id: d.id, name: d.name, status: d.lifecycleStatus, warnings: (d.conversionWarnings || []).slice(-5), createdAt: d.createdAt }; } catch { return null; } })
      .filter(Boolean);
  }

  // ============================================================
  // Source detail & report
  // ============================================================

  /** GET /api/admin/source-import/:sourceId/report */
  @Get(':sourceId/report')
  getSourceReport(@Param('sourceId') id: string) {
    const candidate = this.service.loadCandidate(id);
    if (!candidate) return { ok: false, error: 'Source not found', code: 'NOT_FOUND' };
    return {
      ok: true,
      id: candidate.id, name: candidate.name, lifecycleStatus: candidate.lifecycleStatus,
      capabilities: candidate.capabilities, conversionWarnings: candidate.conversionWarnings,
      validation: candidate.validation, health: candidate.health,
      origin: candidate.origin, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt,
    };
  }

  // ============================================================
  // Source actions
  // ============================================================

  /** POST /api/admin/source-import/:sourceId/validate */
  @Post(':sourceId/validate')
  async validateSource(@Param('sourceId') id: string) {
    const result = await this.service.validateCandidate(id);
    if (!result.ok) return { ok: false, error: result.error, code: 'VALIDATE_FAILED' };
    return { ok: true, status: result.status, validation: result.validation, health: result.health };
  }

  /** POST /api/admin/source-import/:sourceId/retry */
  @Post(':sourceId/retry')
  retrySource(@Param('sourceId') id: string) {
    return this.service.retryCandidate(id);
  }

  /** POST /api/admin/source-import/:sourceId/promote
   *  前置条件: full-chain passed + health score >= 85 */
  @Post(':sourceId/promote')
  async promoteSource(@Param('sourceId') id: string) {
    const candidate = this.service.loadCandidate(id);
    if (!candidate) return { ok: false, error: 'Source not found', code: 'NOT_FOUND' };

    // 1. Re-validate if not already verified
    if (candidate.lifecycleStatus !== 'VERIFIED' && candidate.lifecycleStatus !== 'PROMOTED') {
      const vr = await this.service.validateCandidate(id);
      if (!vr.ok || !vr.validation) return { ok: false, error: 'Validation failed before promote', code: 'VALIDATE_REQUIRED' };
      if (!vr.validation.searchPassed || !vr.validation.detailPassed || !vr.validation.chaptersPassed || !vr.validation.imagesPassed || !vr.validation.proxyPassed) {
        return { ok: false, error: `Full chain not passed: search=${vr.validation.searchPassed} detail=${vr.validation.detailPassed} ch=${vr.validation.chaptersPassed} img=${vr.validation.imagesPassed} proxy=${vr.validation.proxyPassed}`, code: 'CHAIN_INCOMPLETE' };
      }
      if (!vr.health || vr.health.total < 85) {
        return { ok: false, error: `Health score too low: ${vr.health?.total || 0}/100 (need ≥85)`, code: 'SCORE_TOO_LOW' };
      }
    }

    return this.service.promoteCandidate(id);
  }

  /** POST /api/admin/source-import/:sourceId/quarantine */
  @Post(':sourceId/quarantine')
  quarantineSource(@Param('sourceId') id: string, @Body() body: { reason?: string }) {
    return this.service.quarantineCandidate(id, body?.reason);
  }

  /** POST /api/admin/source-import/:sourceId/disable */
  @Post(':sourceId/disable')
  disableSource(@Param('sourceId') id: string, @Body() body: { reason?: string }) {
    return this.service.disableCandidate(id, body?.reason);
  }

  // ============================================================
  // LLM assist
  // ============================================================

  /** POST /api/admin/source-import/:sourceId/llm-assist */
  @Post(':sourceId/llm-assist')
  async llmAssist(@Param('sourceId') id: string) {
    return this.service.requestLlmAssist(id);
  }

  // ============================================================
  // Stable management
  // ============================================================

  /** POST /api/admin/source-import/stable/:id/rollback */
  @Post('stable/:id/rollback')
  rollbackStable(@Param('id') id: string) {
    const result = this.releaseService.rollback(id);
    if (!result.ok) return { ok: false, error: result.reason, code: 'ROLLBACK_FAILED' };
    return { ok: true };
  }
}
