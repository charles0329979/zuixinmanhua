// ============================================================
// packages/source-engine/src/source-selector.ts
// ★ Smart Source Selector — 智能选源
// 3-lane: fast (高权重healthy) → batch (中等权重) → tail (其余)
// ============================================================

import type { MangaSource } from '@zuixinmanhua/types';
import type { SourceLane } from './types';

export interface SourceScore {
  source: MangaSource;
  score: number;
  healthy: boolean;
  lastResponseMs: number;
}

export class SmartSourceSelector {
  private healthData = new Map<string, { healthy: boolean; lastResponseMs: number }>();

  /** Update health data after a source search */
  recordResult(sourceId: string, healthy: boolean, responseMs: number): void {
    this.healthData.set(sourceId, { healthy, lastResponseMs: responseMs });
  }

  /** Get health info for a source */
  getHealth(sourceId: string): { healthy: boolean; lastResponseMs: number } | null {
    return this.healthData.get(sourceId) || null;
  }

  /**
   * Select sources for a search query, organized into 3 lanes.
   *
   * Fast lane:   top 3-5 high-weight healthy sources, timeout 800ms
   * Batch lane:  next 10-15 medium-weight sources, timeout 3000ms
   * Tail lane:   remaining enabled sources, timeout 5000ms
   */
  selectLanes(
    sources: MangaSource[],
    _query: string,
  ): SourceLane[] {
    const enabled = sources.filter(s => s.enabled && s.mode !== 'client');

    // Score each source
    const scored: SourceScore[] = enabled.map(source => {
      const health = this.healthData.get(source.id);
      return {
        source,
        score: this.computeScore(source, health),
        healthy: health?.healthy ?? true,
        lastResponseMs: health?.lastResponseMs ?? 1000,
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Partition into 3 lanes
    const fastLane = scored.slice(0, 5).filter(s => s.healthy);
    const batchLane = scored.slice(5, 20);
    const tailLane = scored.slice(20);

    const lanes: SourceLane[] = [];

    if (fastLane.length > 0) {
      lanes.push({
        priority: 0,
        sources: fastLane.map(s => s.source),
        concurrency: Math.min(3, fastLane.length),
        timeoutMs: 3000,
      });
    }

    if (batchLane.length > 0) {
      lanes.push({
        priority: 1,
        sources: batchLane.map(s => s.source),
        concurrency: 4,
        timeoutMs: 5000,
      });
    }

    if (tailLane.length > 0) {
      lanes.push({
        priority: 2,
        sources: tailLane.map(s => s.source),
        concurrency: 2,
        timeoutMs: 8000,
      });
    }

    return lanes;
  }

  private computeScore(
    source: MangaSource,
    health: { healthy: boolean; lastResponseMs: number } | null | undefined,
  ): number {
    let score = source.weight || 50;

    // Healthy bonus
    if (health?.healthy ?? true) score += 20;
    else score -= 30;

    // Fast response bonus
    if (health && health.lastResponseMs < 1000) score += 15;
    else if (health && health.lastResponseMs > 5000) score -= 10;

    // Language bonus (Chinese sources preferred)
    if (source.language === 'zh') score += 10;

    return score;
  }
}
