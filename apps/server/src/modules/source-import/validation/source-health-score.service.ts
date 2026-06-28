// ============================================================
// SourceHealthScoreService — 健康评分 (0-100)
//
// 评分权重:
//   静态规则完整性: 15
//   网络可达性:     15
//   搜索有效性:     20
//   详情有效性:     15
//   章节有效性:     15
//   图片链路有效性:  15
//   响应速度:        5
//   —————————————————
//   总分:          100
//
// 决策规则 (优先级从高到低):
//   1. staticPassed=false         → STATIC_REJECTED
//   2. requiresLogin=true         → MANUAL_REVIEW
//   3. requiresManualAdapter=true → MANUAL_REVIEW
//   4. searchPassed=false         → QUARANTINED
//   5. detailPassed=false         → QUARANTINED
//   6. chaptersPassed=false       → QUARANTINED
//   7. imagesPassed=false         → QUARANTINED
//   8. proxyPassed=false          → QUARANTINED
//   9. total >= 85 + all passed   → PROMOTE
//  10. total 70-84                → KEEP_CANDIDATE
//  11. total < 70                 → QUARANTINE
// ============================================================

import { Injectable } from '@nestjs/common';
import type { SourceHealthScore, SourceValidationResult } from '../types';
import type { SourceCapabilities } from '../types';

const WEIGHTS = {
  static:  15,
  network: 15,
  search:  20,
  detail:  15,
  chapter: 15,
  image:   15,
  latency:  5,
} as const;

/** 门槛分数 */
const PROMOTE_THRESHOLD   = 85;
const CANDIDATE_THRESHOLD = 70;

@Injectable()
export class SourceScoreService {
  /**
   * 计算书源健康评分 + 推荐动作
   */
  score(
    validation: SourceValidationResult,
    capabilities: SourceCapabilities,
    latencyMs?: number,
  ): SourceHealthScore {
    // ====== 硬性规则 (优先级 1-8) ======

    const zero = () => ({ total: 0, staticScore: 0, networkScore: 0, searchScore: 0, detailScore: 0, chapterScore: 0, imageScore: 0, latencyScore: 0 } as const);

    // 1. 静态规则未通过 → MANUAL_REVIEW (caller routes to STATIC_REJECTED)
    if (!validation.staticPassed) { return { ...zero(), recommendation: 'MANUAL_REVIEW' as const }; }

    // 2. requiresLogin → MANUAL_REVIEW
    if (capabilities.requiresLogin) { return { ...zero(), recommendation: 'MANUAL_REVIEW' as const }; }

    // 3. requiresManualAdapter → MANUAL_REVIEW
    if (capabilities.requiresManualAdapter) { return { ...zero(), recommendation: 'MANUAL_REVIEW' as const }; }

    // 4-8. 链路各步失败 → QUARANTINED
    if (!validation.searchPassed || !validation.detailPassed || !validation.chaptersPassed ||
        !validation.imagesPassed || !validation.proxyPassed) {
      const s = yes(validation.staticPassed,   WEIGHTS.static) +
               yes(validation.networkPassed,  WEIGHTS.network) +
               yes(validation.searchPassed,   WEIGHTS.search) +
               yes(validation.detailPassed,   WEIGHTS.detail) +
               yes(validation.chaptersPassed, WEIGHTS.chapter) +
               0 +
               latency(latencyMs || 99999);
      return this.build(s, yes(validation.staticPassed, WEIGHTS.static), yes(validation.networkPassed, WEIGHTS.network),
        yes(validation.searchPassed, WEIGHTS.search), yes(validation.detailPassed, WEIGHTS.detail),
        yes(validation.chaptersPassed, WEIGHTS.chapter), 0, latency(latencyMs || 99999), 'QUARANTINE');
    }

    // ====== 正常评分 ======
    const staticScore  = yes(validation.staticPassed,   WEIGHTS.static);
    const networkScore = yes(validation.networkPassed,  WEIGHTS.network);
    const searchScore  = yes(validation.searchPassed,   WEIGHTS.search);
    const detailScore  = yes(validation.detailPassed,   WEIGHTS.detail);
    const chapterScore = yes(validation.chaptersPassed, WEIGHTS.chapter);
    const imageScore   = yes(validation.imagesPassed && validation.proxyPassed, WEIGHTS.image);
    const latencyScore = latency(latencyMs || 99999);
    const total = staticScore + networkScore + searchScore + detailScore + chapterScore + imageScore + latencyScore;

    // ====== 推荐决策 (优先级 9-11) ======
    const allPassed = validation.searchPassed && validation.detailPassed &&
                      validation.chaptersPassed && validation.imagesPassed && validation.proxyPassed;

    let recommendation: SourceHealthScore['recommendation'];
    if (total >= PROMOTE_THRESHOLD && allPassed) {
      recommendation = 'PROMOTE';
    } else if (total >= CANDIDATE_THRESHOLD) {
      recommendation = 'KEEP_CANDIDATE';
    } else {
      recommendation = 'QUARANTINE';
    }

    return this.build(total, staticScore, networkScore, searchScore, detailScore, chapterScore, imageScore, latencyScore, recommendation);
  }

  private build(
    total: number, staticScore: number, networkScore: number, searchScore: number,
    detailScore: number, chapterScore: number, imageScore: number, latencyScore: number,
    recommendation: SourceHealthScore['recommendation'],
  ): SourceHealthScore {
    return { total: Math.round(total), staticScore, networkScore, searchScore, detailScore, chapterScore, imageScore, latencyScore, recommendation };
  }
}

// ---- 小工具函数 ----

function yes(passed: boolean, weight: number): number {
  return passed ? weight : 0;
}

function latency(ms: number): number {
  if (ms < 1000) return 5;
  if (ms < 3000) return 4;
  if (ms < 5000) return 3;
  if (ms < 10000) return 2;
  return 1;
}
