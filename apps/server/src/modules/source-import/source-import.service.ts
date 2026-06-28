// ============================================================
// apps/server/src/modules/source-import/source-import.service.ts
// 导入管道编排服务 — 仓库同步 + 批量验证 + 自动 promote
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PipimiaoImporterService } from './parsing/source-importer.service';
import { RepositoryManifestService } from './discovery/repository-manifest.service';
import { SourceStaticLintService } from './validation/source-static-validator.service';
import { SourceNetworkValidatorService } from './validation/source-network-validator.service';
import { SourceSearchValidatorService } from './validation/source-search-validator.service';
import { SourceChainValidatorService } from './validation/source-chain-validator.service';
import { SourceScoreService } from './validation/source-health-score.service';
import { SourcePromotionService } from './release/source-promotion.service';
import { SourceReleaseService } from './registry/source-stable-store.service';
import { SourceQuarantineService } from './registry/source-quarantine-store.service';
import { DeepSeekRuleAssistantService } from './llm/deepseek-rule-assistant.service';
import type {
  ImportedSourceCandidate,
  SourceValidationResult,
  SourceHealthScore,
  ImportRunReport,
} from './types';
import type { MangaSource } from '../../sources/source-store';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SourceImportService {
  private readonly logger = new Logger(SourceImportService.name);
  private readonly candidatesDir: string;
  private readonly manualReviewDir: string;
  private readonly reportsDir: string;
  private readonly validationsDir: string;

  constructor(
    private readonly importer: PipimiaoImporterService,
    private readonly manifestService: RepositoryManifestService,
    private readonly staticLint: SourceStaticLintService,
    private readonly networkValidator: SourceNetworkValidatorService,
    private readonly searchValidator: SourceSearchValidatorService,
    private readonly chainValidator: SourceChainValidatorService,
    private readonly scoreService: SourceScoreService,
    private readonly promotionService: SourcePromotionService,
    private readonly releaseService: SourceReleaseService,
    private readonly quarantineService: SourceQuarantineService,
    private readonly llmAssistant: DeepSeekRuleAssistantService,
  ) {
    const root = path.join(process.cwd(), 'data', 'source-registry');
    this.candidatesDir = path.join(root, 'candidates');
    this.manualReviewDir = path.join(root, 'manual-review');
    this.reportsDir = path.join(root, 'reports', 'import-runs');
    this.validationsDir = path.join(root, 'reports', 'validations');
  }

  // ============================================================
  // 仓库同步
  // ============================================================

  /** 同步指定仓库 */
  async syncRepository(repositoryId: string): Promise<{ ok: boolean; report?: ImportRunReport; error?: string }> {
    const repo = this.manifestService.getRepository(repositoryId);
    if (!repo) {
      return { ok: false, error: `Repository ${repositoryId} not found` };
    }
    this.logger.log(`Starting sync for repository: ${repositoryId}`);
    const report = await this.importer.syncRepository(repositoryId);
    return { ok: true, report };
  }

  // ============================================================
  // 批量验证
  // ============================================================

  /**
   * 对单个候选源运行完整4层验证漏斗
   *
   * Layer 0: 静态校验
   * Layer 1: 网络可达性
   * Layer 2: 搜索功能
   * Layer 3: 全链路 (搜索→详情→章节→图片)
   *
   * 验证通过 → 评分 → auto-promote (如达标)
   */
  async validateCandidate(id: string): Promise<{
    ok: boolean;
    status?: string;
    layer?: number;
    reason?: string;
    health?: SourceHealthScore;
    validation?: SourceValidationResult;
    detail?: Record<string, unknown>;
    error?: string;
  }> {
    const candidate = this.loadCandidate(id);
    if (!candidate) {
      return { ok: false, error: 'Candidate not found' };
    }

    const source = candidate.normalizedSource as MangaSource;
    if (!source || !source.host) {
      return { ok: false, error: 'Invalid source: missing host' };
    }

    // 全链路验证: static → search → detail → chapters → images → proxy
    const validationResult = await this.chainValidator.validate(source);

    // Route based on results
    if (!validationResult.staticPassed) {
      this.promotionService.markManualReview(candidate, `Static lint failed: ${validationResult.errorMessage}`);
      this.saveCandidate(candidate);
      return { ok: true, status: candidate.lifecycleStatus, validation: validationResult };
    }
    if (!validationResult.searchPassed) {
      this.quarantineService.quarantine(candidate);
      this.promotionService.quarantine(candidate, `Search failed: ${validationResult.errorMessage}`);
      this.saveCandidate(candidate);
      return { ok: true, status: candidate.lifecycleStatus, validation: validationResult };
    }
    if (!validationResult.detailPassed || !validationResult.chaptersPassed) {
      this.quarantineService.quarantine(candidate);
      this.promotionService.quarantine(candidate, `Chain failed: ${validationResult.errorMessage}`);
      this.saveCandidate(candidate);
      return { ok: true, status: candidate.lifecycleStatus, validation: validationResult };
    }
    if (!validationResult.imagesPassed || !validationResult.proxyPassed) {
      this.promotionService.markManualReview(candidate, `Image/proxy chain failed: ${validationResult.errorMessage}`);
      this.saveCandidate(candidate);
      return { ok: true, status: candidate.lifecycleStatus, validation: validationResult };
    }

    candidate.validation = validationResult;

    // Score
    const health = this.scoreService.score(
      validationResult,
      candidate.capabilities,
      validationResult.latencyMs,
    );
    candidate.health = health;
    candidate.lifecycleStatus = 'VERIFIED';

    // Auto-promote if eligible
    if (health.recommendation === 'PROMOTE') {
      const promoteResult = this.promotionService.promote(candidate);
      if (promoteResult.ok) {
        const publishResult = this.releaseService.publish(candidate);
        if (publishResult.ok) {
          this.logger.log(`Auto-promoted: ${candidate.id} → stable`);
        }
      }
    } else if (health.recommendation === 'QUARANTINE') {
      this.quarantineService.quarantine(candidate);
      this.promotionService.quarantine(candidate, `Score ${health.total} < threshold`);
    }

    this.saveCandidate(candidate);

    return {
      ok: true,
      status: candidate.lifecycleStatus,
      health,
      validation: validationResult,
    };
  }

  /**
   * 批量验证所有 PENDING_VALIDATE 状态的候选源
   */
  async validateAllPending(): Promise<{
    total: number;
    passed: number;
    failed: number;
    promoted: number;
    results: { id: string; status: string; healthScore?: number }[];
  }> {
    const candidates = this.listCandidates();
    const pending = candidates.filter(c => c.lifecycleStatus === 'PENDING_VALIDATE');

    this.logger.log(`Batch validating ${pending.length} pending candidates`);

    const results: { id: string; status: string; healthScore?: number }[] = [];
    let passed = 0;
    let failed = 0;
    let promoted = 0;

    for (const candidate of pending) {
      try {
        const result = await this.validateCandidate(candidate.id);
        if (result.ok) {
          if (result.status === 'PROMOTED') promoted++;
          if (result.status === 'VERIFIED' || result.status === 'PROMOTED') passed++;
          else failed++;
        } else {
          failed++;
        }
        results.push({
          id: candidate.id,
          status: result.status || 'ERROR',
          healthScore: result.health?.total,
        });
      } catch (e: any) {
        failed++;
        results.push({ id: candidate.id, status: 'ERROR' });
      }

      // Small delay between validations to avoid overloading
      await new Promise(r => setTimeout(r, 500));
    }

    return { total: pending.length, passed, failed, promoted, results };
  }

  // ============================================================
  // 单源操作
  // ============================================================

  promoteCandidate(id: string): { ok: boolean; reason?: string } {
    const candidate = this.loadCandidate(id);
    if (!candidate) return { ok: false, reason: 'Not found' };

    if (!candidate.validation?.imagesPassed || !candidate.validation?.proxyPassed) {
      return { ok: false, reason: 'Cannot promote: image chain not verified' };
    }
    if (candidate.health && candidate.health.total < 85) {
      return { ok: false, reason: `Cannot promote: health score ${candidate.health.total} < 85` };
    }

    const promoteResult = this.promotionService.promote(candidate);
    if (!promoteResult.ok) return promoteResult;

    const publishResult = this.releaseService.publish(candidate);
    this.saveCandidate(candidate);
    return publishResult;
  }

  quarantineCandidate(id: string, reason?: string): { ok: boolean; reason?: string } {
    const candidate = this.loadCandidate(id);
    if (!candidate) return { ok: false, reason: 'Not found' };
    const result = this.promotionService.quarantine(candidate, reason || 'Manual quarantine');
    if (result.ok) {
      this.quarantineService.quarantine(candidate);
      this.releaseService.unpublish(id);
    }
    this.saveCandidate(candidate);
    return result;
  }

  disableCandidate(id: string, reason?: string): { ok: boolean; reason?: string } {
    const candidate = this.loadCandidate(id);
    if (!candidate) return { ok: false, reason: 'Not found' };
    const result = this.promotionService.disable(candidate, reason || 'Manual disable');
    if (result.ok) {
      this.releaseService.unpublish(id);
    }
    this.saveCandidate(candidate);
    return result;
  }

  retryCandidate(id: string): { ok: boolean; reason?: string } {
    const candidate = this.loadCandidate(id);
    if (!candidate) return { ok: false, reason: 'Not found' };
    const result = this.promotionService.retry(candidate);
    if (result.ok) {
      this.quarantineService.remove(id);
      this.saveCandidate(candidate);
    }
    return result;
  }

  // ============================================================
  // LLM 辅助映射
  // ============================================================

  /**
   * 请求 DeepSeek 辅助映射候选源的未识别字段
   * 仅在 LLM enabled 且候选源有 unmappedFields 时有效
   */
  async requestLlmAssist(id: string): Promise<{
    ok: boolean;
    applied?: number;
    error?: string;
  }> {
    if (!this.llmAssistant.isAvailable()) {
      return { ok: false, error: 'LLM assistant is not available (disabled or no API key)' };
    }

    const candidate = this.loadCandidate(id);
    if (!candidate) return { ok: false, error: 'Candidate not found' };

    const source = candidate.normalizedSource as MangaSource;
    if (!source) return { ok: false, error: 'No normalized source' };

    // The normalized source may not have unmapped fields in MangaSource format
    // Convert back to canonical-like structure for LLM
    // For now, we work with what we have
    const canonical = {
      id: source.id,
      name: source.name,
      host: source.host,
      language: source.language || 'zh',
      search: {
        url: source.search?.url || '',
        method: (source.search?.method || 'GET') as 'GET' | 'POST',
        responseType: (source.search?.responseType || 'html') as 'html' | 'json',
        listSelector: source.search?.listSelector || '',
        itemSelectors: {
          title: source.search?.titleSelector || '',
          cover: source.search?.coverSelector || '',
          url: source.search?.detailUrlSelector || '',
        },
      },
      detail: {
        url: '',
        method: 'GET' as const,
        responseType: 'html' as const,
        listSelector: '',
        itemSelectors: {
          title: source.detail?.titleSelector || '',
          cover: source.detail?.coverSelector,
          author: source.detail?.authorSelector,
          description: source.detail?.descriptionSelector,
        },
      },
      chapters: {
        url: '',
        method: 'GET' as const,
        responseType: 'html' as const,
        listSelector: source.chapters?.listSelector || '',
        itemSelectors: {
          title: source.chapters?.titleSelector || '',
          url: source.chapters?.urlSelector || '',
        },
      },
      images: {
        url: '',
        method: 'GET' as const,
        responseType: 'html' as const,
        listSelector: source.images?.listSelector || '',
        itemSelectors: { src: source.images?.srcAttribute || 'src' },
      },
      rawRules: source,
      fieldMappings: [],
      unmappedFields: (candidate.conversionWarnings || []).map((w, i) => ({
        rawPath: `warning.${i}`,
        rawValue: w,
        reason: 'Conversion warning may indicate unmapped field',
      })),
      warnings: candidate.conversionWarnings || [],
      capabilities: candidate.capabilities,
    };

    const response = await this.llmAssistant.assistMapping(canonical as any);
    if (!response) {
      return { ok: false, error: 'LLM assist returned no result' };
    }

    // Apply mappings (only if confidence >= 0.95)
    const applied = this.llmAssistant.applyMapping(canonical as any, response);
    const adoptedCount = applied.fieldMappings.filter(m => m.method === 'llm-assisted').length;

    return { ok: true, applied: adoptedCount };
  }

  // ============================================================
  // 查询方法
  // ============================================================

  listCandidates(): ImportedSourceCandidate[] {
    return this.listDir(this.candidatesDir).map(f => {
      try {
        return JSON.parse(fs.readFileSync(
          path.join(this.candidatesDir, `${f.id || f}.json`),
          'utf-8',
        ));
      } catch { return null; }
    }).filter(Boolean) as ImportedSourceCandidate[];
  }

  getCandidateReport(id: string): ImportedSourceCandidate | null {
    return this.loadCandidate(id);
  }

  // ============================================================
  // Private helpers
  // ============================================================

  loadCandidate(id: string): ImportedSourceCandidate | null {
    // Try candidates/, then manual-review/
    for (const dir of [this.candidatesDir, this.manualReviewDir]) {
      const filePath = path.join(dir, `${id}.json`);
      try {
        if (!fs.existsSync(filePath)) continue;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch { continue; }
    }
    return null;
  }

  private saveCandidate(candidate: ImportedSourceCandidate): void {
    // MANUAL_REVIEW 状态写入 manual-review/ 目录
    const isManual = candidate.lifecycleStatus === 'MANUAL_REVIEW';
    const dir = isManual ? this.manualReviewDir : this.candidatesDir;
    const filePath = path.join(dir, `${candidate.id}.json`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(candidate, null, 2), 'utf-8');
    // 如果状态从 MANUAL_REVIEW 恢复到其他状态，从 manual-review 删除
    if (!isManual) {
      const manualPath = path.join(this.manualReviewDir, `${candidate.id}.json`);
      try { if (fs.existsSync(manualPath)) fs.unlinkSync(manualPath); } catch {}
    }
  }

  /** 保存验证报告到 reports/validations/ */
  private saveValidationReport(candidateId: string, report: Record<string, unknown>): void {
    const filePath = path.join(this.validationsDir, `${candidateId}.json`);
    fs.mkdirSync(this.validationsDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      candidateId,
      timestamp: new Date().toISOString(),
      ...report,
    }, null, 2), 'utf-8');
  }

  private listDir(dir: string): Record<string, unknown>[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          return {
            id: data.id,
            name: data.name || data.source?.name,
            status: data.lifecycleStatus,
            healthScore: data.health?.total,
            recommendation: data.health?.recommendation,
            updatedAt: data.updatedAt,
          };
        } catch { return null; }
      })
      .filter(Boolean) as Record<string, unknown>[];
  }
}
