// ============================================================
// source-platform/registry/source-registry.service.ts
// SourceRegistryService — 唯一书源注册中心 (V9)
//
// 数据目录:
//   data/source-platform/registry/
//     stable/         ← 运行级书源 (OTA下发)
//     candidates/     ← 待验证
//     quarantine/     ← 验证失败
//     manual-review/  ← 格式不明/需人工
//     disabled/       ← 人工关闭
//
// stable 是唯一运行级书源集合。
// candidates/quarantine/manual-review/disabled 不下发给 APP。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// ---- 类型 ----

export interface StableSourceEntry {
  id: string; name: string; version: string; hash: string;
  host: string; healthScore: number; publishedAt: string;
  capabilities: Record<string, boolean>;
  origin?: { provider: string; repositoryUrl?: string; commitSha?: string; filePath?: string };
}

export interface StableIndex {
  version: string; channel: 'stable'; updatedAt: string; sources: StableSourceEntry[];
}

export interface RegistryStats {
  stable: number; candidates: number; quarantine: number;
  manualReview: number; disabled: number;
}

export type RegistrySection = 'stable' | 'candidates' | 'quarantine' | 'manual-review' | 'disabled';

@Injectable()
export class SourceRegistryService {
  private readonly logger = new Logger(SourceRegistryService.name);
  private readonly root: string;

  constructor() {
    this.root = path.join(process.cwd(), 'data', 'source-platform', 'registry');
    this.ensureDirs();
  }

  // ============================================================
  // 目录
  // ============================================================

  private ensureDirs(): void {
    for (const d of ['stable', 'candidates', 'quarantine', 'manual-review', 'disabled']) {
      fs.mkdirSync(path.join(this.root, d), { recursive: true });
    }
  }

  private dir(section: RegistrySection): string {
    return path.join(this.root, section);
  }

  // ============================================================
  // 通用 CRUD
  // ============================================================

  list(section: RegistrySection): Record<string, unknown>[] {
    const d = this.dir(section);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf-8')); } catch { return null; } })
      .filter(Boolean) as Record<string, unknown>[];
  }

  get(section: RegistrySection, id: string): Record<string, unknown> | null {
    const fp = path.join(this.dir(section), `${id}.json`);
    try { return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : null; }
    catch { return null; }
  }

  save(section: RegistrySection, id: string, data: Record<string, unknown>): void {
    const d = this.dir(section);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8');
  }

  remove(section: RegistrySection, id: string): void {
    const fp = path.join(this.dir(section), `${id}.json`);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
  }

  move(from: RegistrySection, to: RegistrySection, id: string): void {
    const entry = this.get(from, id);
    if (!entry) return;
    this.save(to, id, entry);
    this.remove(from, id);
    this.logger.log(`Registry: ${id} ${from} → ${to}`);
  }

  // ============================================================
  // 便捷方法
  // ============================================================

  getStableIds(): string[] {
    const d = this.dir('stable');
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  }

  listStable(): StableSourceEntry[] {
    return this.list('stable') as unknown as StableSourceEntry[];
  }

  getStable(id: string): StableSourceEntry | null {
    return this.get('stable', id) as unknown as StableSourceEntry | null;
  }

  publishStable(entry: StableSourceEntry): void {
    this.save('stable', entry.id, entry as unknown as Record<string, unknown>);
  }

  unpublishStable(id: string): void {
    this.remove('stable', id);
  }

  listCandidates() { return this.list('candidates'); }
  listQuarantine() { return this.list('quarantine'); }
  listManualReview() { return this.list('manual-review'); }
  listDisabled() { return this.list('disabled'); }

  saveCandidate(id: string, data: Record<string, unknown>) { this.save('candidates', id, data); }
  saveQuarantine(id: string, data: Record<string, unknown>) { this.save('quarantine', id, data); }
  saveManualReview(id: string, data: Record<string, unknown>) { this.save('manual-review', id, data); }
  saveDisabled(id: string, data: Record<string, unknown>) { this.save('disabled', id, data); }

  disableSource(id: string): void {
    this.move('stable', 'disabled', id);
  }

  getStats(): RegistryStats {
    const c = (s: RegistrySection) => {
      const d = this.dir(s);
      return (fs.existsSync(d)) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).length : 0;
    };
    return {
      stable: c('stable'), candidates: c('candidates'), quarantine: c('quarantine'),
      manualReview: c('manual-review'), disabled: c('disabled'),
    };
  }
}
