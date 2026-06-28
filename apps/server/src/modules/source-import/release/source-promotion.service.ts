// ============================================================
// apps/server/src/modules/source-import/promotion/source-promotion.service.ts
// 状态机管理 — promote / quarantine / disable 及其前置检查
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type {
  ImportedSourceCandidate,
  SourceLifecycleStatus,
  SourceValidationResult,
  SourceHealthScore,
} from '../types';
import { isValidTransition } from '../types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SourcePromotionService {
  private readonly logger = new Logger(SourcePromotionService.name);
  private readonly registryRoot: string;

  constructor() {
    this.registryRoot = path.join(process.cwd(), 'data', 'source-registry');
  }

  /**
   * Promote: 将已验证的候选源提升到 stable
   *
   * 前置条件:
   *   1. lifecycleStatus 必须是 VERIFIED
   *   2. healthScore.total >= 85
   *   3. 全链路通过 (imagesPassed + proxyPassed)
   *   4. 状态转换合法
   */
  promote(candidate: ImportedSourceCandidate): { ok: boolean; reason?: string } {
    // 前置检查
    if (candidate.lifecycleStatus !== 'VERIFIED') {
      return { ok: false, reason: `Status must be VERIFIED, current: ${candidate.lifecycleStatus}` };
    }
    if (!candidate.health) {
      return { ok: false, reason: 'No health score available' };
    }
    if (candidate.health.total < 85) {
      return { ok: false, reason: `Health score ${candidate.health.total} < 85` };
    }
    if (!candidate.validation?.imagesPassed || !candidate.validation?.proxyPassed) {
      return { ok: false, reason: 'Full image chain not passed' };
    }
    if (!isValidTransition(candidate.lifecycleStatus, 'PROMOTED')) {
      return { ok: false, reason: `Invalid transition: ${candidate.lifecycleStatus} → PROMOTED` };
    }

    // 执行状态转换
    candidate.lifecycleStatus = 'PROMOTED';
    candidate.updatedAt = new Date().toISOString();

    this.logger.log(`PROMOTED: ${candidate.id} (${candidate.name}) — score=${candidate.health.total}`);
    return { ok: true };
  }

  /**
   * Quarantine: 将候选源隔离
   */
  quarantine(
    candidate: ImportedSourceCandidate,
    reason: string,
  ): { ok: boolean; reason?: string } {
    const validFrom = ['PENDING_VALIDATE', 'VALIDATING', 'VERIFIED', 'PROMOTED', 'MANUAL_REVIEW'] as SourceLifecycleStatus[];
    if (!validFrom.includes(candidate.lifecycleStatus)) {
      return { ok: false, reason: `Cannot quarantine from ${candidate.lifecycleStatus}` };
    }
    if (!isValidTransition(candidate.lifecycleStatus, 'QUARANTINED')) {
      return { ok: false, reason: `Invalid transition: ${candidate.lifecycleStatus} → QUARANTINED` };
    }

    candidate.lifecycleStatus = 'QUARANTINED';
    candidate.updatedAt = new Date().toISOString();
    if (reason) {
      candidate.conversionWarnings.push(`Quarantine reason: ${reason}`);
    }

    this.logger.warn(`QUARANTINED: ${candidate.id} — ${reason}`);
    return { ok: true };
  }

  /**
   * Disable: 禁用候选源
   */
  disable(
    candidate: ImportedSourceCandidate,
    reason: string,
  ): { ok: boolean; reason?: string } {
    if (!isValidTransition(candidate.lifecycleStatus, 'DISABLED')) {
      return { ok: false, reason: `Invalid transition: ${candidate.lifecycleStatus} → DISABLED` };
    }

    candidate.lifecycleStatus = 'DISABLED';
    candidate.updatedAt = new Date().toISOString();
    if (reason) {
      candidate.conversionWarnings.push(`Disable reason: ${reason}`);
    }

    this.logger.warn(`DISABLED: ${candidate.id} — ${reason}`);
    return { ok: true };
  }

  /**
   * 设置为需要人工审核
   */
  markManualReview(
    candidate: ImportedSourceCandidate,
    reason: string,
  ): { ok: boolean; reason?: string } {
    const validFrom = ['PARSED', 'PENDING_VALIDATE', 'VALIDATING', 'QUARANTINED',
                        'STATIC_REJECTED'] as SourceLifecycleStatus[];
    if (!validFrom.includes(candidate.lifecycleStatus)) {
      return { ok: false, reason: `Cannot mark MANUAL_REVIEW from ${candidate.lifecycleStatus}` };
    }

    candidate.lifecycleStatus = 'MANUAL_REVIEW';
    candidate.updatedAt = new Date().toISOString();
    candidate.conversionWarnings.push(`Manual review: ${reason}`);

    this.logger.log(`MANUAL_REVIEW: ${candidate.id} — ${reason}`);
    return { ok: true };
  }

  /**
   * 重新验证 (QUARANTINED → PENDING_VALIDATE)
   */
  retry(candidate: ImportedSourceCandidate): { ok: boolean; reason?: string } {
    if (!isValidTransition(candidate.lifecycleStatus, 'PENDING_VALIDATE')) {
      return { ok: false, reason: `Cannot retry from ${candidate.lifecycleStatus}` };
    }

    candidate.lifecycleStatus = 'PENDING_VALIDATE';
    candidate.validation = undefined;
    candidate.health = undefined;
    candidate.updatedAt = new Date().toISOString();

    this.logger.log(`RETRY: ${candidate.id} — reset to PENDING_VALIDATE`);
    return { ok: true };
  }
}
