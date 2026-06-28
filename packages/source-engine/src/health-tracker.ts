// ============================================================
// SourceHealthTracker — tracks source health locally
// Persists to storage for offline use
// ============================================================

import type { MangaSource } from '@zuixinmanhua/types';

export interface SourceHealthRecord {
  sourceId: string;
  totalSearches: number;
  successfulSearches: number;
  avgResponseMs: number;
  lastCheckAt: number;
  consecutiveFailures: number;
  isBlocked: boolean;
  blockedUntil: number;
}

export class SourceHealthTracker {
  private records = new Map<string, SourceHealthRecord>();

  constructor(private persistFn?: (records: SourceHealthRecord[]) => Promise<void>) {}

  recordSuccess(sourceId: string, responseMs: number): void {
    const r = this.getOrCreate(sourceId);
    r.totalSearches++;
    r.successfulSearches++;
    r.avgResponseMs = (r.avgResponseMs * (r.successfulSearches - 1) + responseMs) / r.successfulSearches;
    r.lastCheckAt = Date.now();
    r.consecutiveFailures = 0;
    r.isBlocked = false;
    this.maybePersist();
  }

  recordFailure(sourceId: string, error: string): void {
    const r = this.getOrCreate(sourceId);
    r.totalSearches++;
    r.consecutiveFailures++;
    r.lastCheckAt = Date.now();
    if (r.consecutiveFailures >= 3) {
      r.isBlocked = true;
      r.blockedUntil = Date.now() + 24 * 3600 * 1000; // 24h
    }
    this.maybePersist();
  }

  getHealth(sourceId: string): SourceHealthRecord | null {
    return this.records.get(sourceId) || null;
  }

  isSourceHealthy(sourceId: string): boolean {
    const r = this.records.get(sourceId);
    if (!r) return true; // Unknown = assume healthy
    if (r.isBlocked && Date.now() > r.blockedUntil) {
      r.isBlocked = false;
      r.consecutiveFailures = 0;
      return true;
    }
    return !r.isBlocked;
  }

  getHealthySources(sources: MangaSource[]): MangaSource[] {
    return sources.filter(s => this.isSourceHealthy(s.id) && s.enabled);
  }

  async loadSaved(records: SourceHealthRecord[]): Promise<void> {
    for (const r of records) {
      this.records.set(r.sourceId, r);
    }
  }

  getAllRecords(): SourceHealthRecord[] {
    return [...this.records.values()];
  }

  private getOrCreate(sourceId: string): SourceHealthRecord {
    if (!this.records.has(sourceId)) {
      this.records.set(sourceId, {
        sourceId, totalSearches: 0, successfulSearches: 0,
        avgResponseMs: 0, lastCheckAt: 0, consecutiveFailures: 0,
        isBlocked: false, blockedUntil: 0,
      });
    }
    return this.records.get(sourceId)!;
  }

  private maybePersist(): void {
    if (this.persistFn) {
      this.persistFn(this.getAllRecords()).catch(() => {});
    }
  }
}
