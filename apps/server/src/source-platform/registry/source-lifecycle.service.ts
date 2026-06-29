// ============================================================
// source-platform/registry/source-lifecycle.service.ts
// SourceLifecycleService — 书源生命周期状态机
//
// 状态: PARSED → PENDING_VALIDATE → VALIDATING → VERIFIED → PROMOTED
//                                              ↘ QUARANTINED
//                                              ↘ MANUAL_REVIEW
//                                              ↘ DISABLED
// ============================================================

import { Injectable, Logger } from '@nestjs/common';

export type LifecycleStatus =
  | 'PARSED'
  | 'PENDING_VALIDATE'
  | 'VALIDATING'
  | 'VERIFIED'
  | 'PROMOTED'
  | 'QUARANTINED'
  | 'MANUAL_REVIEW'
  | 'STATIC_REJECTED'
  | 'DISABLED';

/** 合法状态转换表 */
const VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  'PARSED':            ['PENDING_VALIDATE', 'MANUAL_REVIEW', 'DISABLED'],
  'PENDING_VALIDATE':  ['VALIDATING', 'MANUAL_REVIEW', 'QUARANTINED', 'DISABLED'],
  'VALIDATING':        ['VERIFIED', 'QUARANTINED', 'MANUAL_REVIEW', 'DISABLED'],
  'VERIFIED':          ['PROMOTED', 'QUARANTINED', 'MANUAL_REVIEW', 'DISABLED'],
  'PROMOTED':          ['QUARANTINED', 'DISABLED'],
  'QUARANTINED':       ['PENDING_VALIDATE', 'MANUAL_REVIEW', 'DISABLED'],
  'MANUAL_REVIEW':     ['PENDING_VALIDATE', 'QUARANTINED', 'DISABLED'],
  'STATIC_REJECTED':   ['PENDING_VALIDATE', 'MANUAL_REVIEW', 'DISABLED'],
  'DISABLED':          ['PENDING_VALIDATE'],
};

@Injectable()
export class SourceLifecycleService {
  private readonly logger = new Logger(SourceLifecycleService.name);

  /** 检查是否可以从 from 转换到 to */
  canTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /** 执行转换，非法转换返回 false */
  transition(
    current: LifecycleStatus,
    target: LifecycleStatus,
  ): { ok: boolean; newStatus: LifecycleStatus; reason?: string } {
    if (!this.canTransition(current, target)) {
      return {
        ok: false,
        newStatus: current,
        reason: `Cannot transition from ${current} to ${target}`,
      };
    }
    this.logger.log(`Lifecycle: ${current} → ${target}`);
    return { ok: true, newStatus: target };
  }

  /** 判断是否可以在 APP/OTA 中暴露 */
  isExposable(status: LifecycleStatus): boolean {
    return status === 'PROMOTED' || status === 'VERIFIED';
  }

  /** 判断是否需要人工介入 */
  isManualReview(status: LifecycleStatus): boolean {
    return status === 'MANUAL_REVIEW' || status === 'STATIC_REJECTED';
  }
}
