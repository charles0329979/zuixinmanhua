// ============================================================
// apps/server/src/modules/source-import/promotion/source-release.service.ts
// Stable 发布管理 — 写入/读取 stable 目录，版本管理，回滚
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ImportedSourceCandidate } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StableRelease {
  id: string;
  name: string;
  version: string;
  channel: 'stable';
  status: 'PROMOTED';
  healthScore: number;
  origin: Record<string, unknown>;
  publishedAt: string;
  hash: string;
  capabilities: Record<string, boolean>;
  source: MangaSource;
}

export interface ReleaseHistory {
  sourceId: string;
  versions: {
    version: string;
    hash: string;
    publishedAt: string;
    healthScore: number;
  }[];
}

@Injectable()
export class SourceReleaseService {
  private readonly logger = new Logger(SourceReleaseService.name);
  private readonly stableDir: string;
  private readonly historyDir: string;
  private readonly manifestsDir: string;

  constructor() {
    const registryRoot = path.join(process.cwd(), 'data', 'source-registry');
    this.stableDir = path.join(registryRoot, 'stable');
    this.historyDir = path.join(registryRoot, 'stable', '.history');
    this.manifestsDir = path.join(registryRoot, 'manifests');
  }

  /**
   * 发布候选源到 stable 目录
   */
  publish(candidate: ImportedSourceCandidate): { ok: boolean; release?: StableRelease; reason?: string } {
    if (candidate.lifecycleStatus !== 'PROMOTED') {
      return { ok: false, reason: `Not PROMOTED (current: ${candidate.lifecycleStatus})` };
    }

    const source = candidate.normalizedSource as MangaSource;
    const hash = this.computeHash(source);
    const now = new Date().toISOString();

    const release: StableRelease = {
      id: candidate.id,
      name: candidate.name,
      version: `1.0.0-${hash.slice(0, 8)}`,
      channel: 'stable',
      status: 'PROMOTED',
      healthScore: candidate.health?.total || 0,
      origin: (candidate.origin || {}) as unknown as Record<string, unknown>,
      publishedAt: now,
      hash,
      capabilities: {
        search: candidate.capabilities.search,
        detail: candidate.capabilities.detail,
        chapters: candidate.capabilities.chapters,
        images: candidate.capabilities.images,
      },
      source: {
        ...source,
        enabled: true, // Enable when published
        lifecycleStatus: 'PROMOTED' as any,
        healthScore: candidate.health,
        origin: candidate.origin,
        capabilities: candidate.capabilities,
        validation: candidate.validation,
      },
    };

    // 保存到 stable 目录
    const filePath = path.join(this.stableDir, `${candidate.id}.json`);
    const previous = this.getRelease(candidate.id);

    // 如果之前有版本，归档
    if (previous) {
      this.archiveVersion(candidate.id, previous);
    }

    fs.mkdirSync(this.stableDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(release, null, 2), 'utf-8');

    // 更新 stable-index.json
    this.updateStableIndex();

    this.logger.log(`Published to stable: ${candidate.id} v${release.version} (score=${release.healthScore})`);

    return { ok: true, release };
  }

  /** 生成 manifests/stable-index.json — OTA 发现端点 */
  private updateStableIndex(): void {
    const allStable = this.listAllStable();
    const index = {
      generatedAt: new Date().toISOString(),
      total: allStable.length,
      sources: allStable.map(s => ({
        id: s.id,
        name: s.name,
        version: s.version,
        hash: s.hash,
        healthScore: s.healthScore,
        origin: s.origin,
        capabilities: s.capabilities,
        publishedAt: s.publishedAt,
        host: s.source?.host || '',
      })),
    };
    fs.mkdirSync(this.manifestsDir, { recursive: true });
    fs.writeFileSync(path.join(this.manifestsDir, 'stable-index.json'), JSON.stringify(index, null, 2), 'utf-8');
  }

  /** 获取 stable-index.json 内容 */
  getStableIndex(): Record<string, unknown> {
    try {
      const p = path.join(this.manifestsDir, 'stable-index.json');
      if (!fs.existsSync(p)) return { total: 0, sources: [] };
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return { total: 0, sources: [] };
    }
  }

  /**
   * 获取 stable 渠道中已发布的源
   */
  getRelease(id: string): StableRelease | null {
    const filePath = path.join(this.stableDir, `${id}.json`);
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * 列出所有 stable 源 (供 OTA 使用)
   */
  listAllStable(): StableRelease[] {
    if (!fs.existsSync(this.stableDir)) return [];
    return fs.readdirSync(this.stableDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.stableDir, f), 'utf-8'));
        } catch { return null; }
      })
      .filter(Boolean) as StableRelease[];
  }

  /**
   * 回滚到上一个版本
   */
  rollback(id: string): { ok: boolean; reason?: string } {
    const filePath = path.join(this.stableDir, `${id}.json`);
    const history = this.getHistory(id);

    if (!history || history.versions.length < 2) {
      return { ok: false, reason: 'No previous version to rollback to' };
    }

    // 获取上一个版本
    const previousVersion = history.versions[history.versions.length - 2];
    const archivePath = path.join(
      this.historyDir,
      id,
      `${previousVersion.hash.slice(0, 12)}.json`,
    );

    try {
      const previousRelease = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
      // 恢复到 stable 目录
      fs.writeFileSync(filePath, JSON.stringify(previousRelease, null, 2), 'utf-8');

      this.logger.log(`Rolled back ${id} to ${previousVersion.version}`);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: `Rollback failed: ${e.message}` };
    }
  }

  /**
   * 获取源的发布历史
   */
  getHistory(id: string): ReleaseHistory | null {
    const historyPath = path.join(this.historyDir, id, 'history.json');
    try {
      if (!fs.existsSync(historyPath)) return null;
      return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * 从 stable 移除 (源被 DISABLED)
   */
  unpublish(id: string): { ok: boolean; reason?: string } {
    const filePath = path.join(this.stableDir, `${id}.json`);
    try {
      if (!fs.existsSync(filePath)) {
        return { ok: false, reason: 'Not in stable' };
      }
      const release = this.getRelease(id);
      if (release) {
        this.archiveVersion(id, release);
      }
      fs.unlinkSync(filePath);
      this.logger.log(`Unpublished from stable: ${id}`);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e.message };
    }
  }

  // ========== Private helpers ==========

  private computeHash(source: MangaSource): string {
    const normalized = {
      search: source.search,
      detail: source.detail,
      chapters: source.chapters,
      images: source.images,
      host: source.host,
      headers: source.headers,
    };
    return crypto.createHash('sha256')
      .update(JSON.stringify(normalized), 'utf-8')
      .digest('hex');
  }

  private archiveVersion(id: string, release: StableRelease): void {
    const archiveDir = path.join(this.historyDir, id);
    fs.mkdirSync(archiveDir, { recursive: true });

    const archivePath = path.join(archiveDir, `${release.hash.slice(0, 12)}.json`);
    fs.writeFileSync(archivePath, JSON.stringify(release, null, 2), 'utf-8');

    // 更新历史记录
    const history: ReleaseHistory = this.getHistory(id) || { sourceId: id, versions: [] };
    history.versions.push({
      version: release.version,
      hash: release.hash,
      publishedAt: release.publishedAt,
      healthScore: release.healthScore,
    });
    fs.writeFileSync(
      path.join(archiveDir, 'history.json'),
      JSON.stringify(history, null, 2),
      'utf-8',
    );
  }
}
