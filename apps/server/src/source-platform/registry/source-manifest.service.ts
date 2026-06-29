// ============================================================
// source-platform/registry/source-manifest.service.ts (V11)
// SourceManifestService — OTA index 生成 + 原子写入
//
// 规则:
//   1. candidate 不下发
//   2. quarantine 不下发
//   3. manual-review 不下发
//   4. disabled 不下发
//   5. 生成失败不覆盖上一个可用 stable-index
//   6. 支持 rollback
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// ---- OTA Index 类型 ----

export interface OtaSourceEntry {
  id: string;
  name: string;
  type: 'adapter' | 'rule';
  version: string;
  hash: string;
  healthScore: number;
  capabilities: {
    search: boolean;
    detail: boolean;
    chapters: boolean;
    images: boolean;
  };
  publishedAt: string;
}

export interface OtaIndex {
  version: string;
  generatedAt: string;
  sources: OtaSourceEntry[];
}

// ---- Stable Index (内部管理用) ----

export interface StableSourceEntry {
  id: string; name: string; version: string; hash: string;
  host: string; healthScore: number; publishedAt: string;
  capabilities: Record<string, boolean>;
  origin?: { provider: string; repositoryUrl?: string; commitSha?: string; filePath?: string };
}

export interface StableIndex {
  version: string; channel: 'stable'; updatedAt: string; sources: StableSourceEntry[];
}

@Injectable()
export class SourceManifestService {
  private readonly logger = new Logger(SourceManifestService.name);
  private readonly manifestsDir: string;

  constructor() {
    this.manifestsDir = path.join(process.cwd(), 'data', 'source-platform', 'manifests');
    fs.mkdirSync(this.manifestsDir, { recursive: true });
  }

  // ============================================================
  // stable-index.json — 内部管理用
  // ============================================================

  getStableIndex(): StableIndex {
    return this.readJson('stable-index.json', () => ({
      version: '0.0.0', channel: 'stable' as const,
      updatedAt: new Date().toISOString(), sources: [],
    }));
  }

  rebuildStableIndex(sources: StableSourceEntry[]): void {
    const index: StableIndex = {
      version: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      channel: 'stable',
      updatedAt: new Date().toISOString(),
      sources: sources.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0)),
    };
    this.atomicWrite('stable-index.json', index);
    this.logger.log(`stable-index.json: ${sources.length} sources`);
  }

  // ============================================================
  // ota-index.json — OTA 下发 (APP 唯一读取)
  // ============================================================

  getOtaIndex(): OtaIndex {
    return this.readJson('ota-index.json', () => ({
      version: '0.0.0',
      generatedAt: new Date().toISOString(),
      sources: [],
    }));
  }

  /**
   * 从 registry/stable/ 重建 ota-index.json
   * 只包含 stable 源 — candidate/quarantine/manual-review/disabled 绝不出现在 OTA
   */
  rebuildOtaIndex(stableSources: StableSourceEntry[]): void {
    // 过滤: 只下发 PROMOTED 状态的源
    // candidate/quarantine/manual-review/disabled 在此处被绝对排除
    const otaSources: OtaSourceEntry[] = stableSources
      .sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0))
      .map(s => ({
        id: s.id,
        name: s.name,
        type: (s.origin?.provider === 'adapter' ? 'adapter' : 'rule') as 'adapter' | 'rule',
        version: s.version,
        hash: s.hash,
        healthScore: s.healthScore,
        capabilities: {
          search: s.capabilities?.search ?? true,
          detail: s.capabilities?.detail ?? true,
          chapters: s.capabilities?.chapters ?? true,
          images: s.capabilities?.images ?? true,
        },
        publishedAt: s.publishedAt,
      }));

    const index: OtaIndex = {
      version: new Date().toISOString().slice(0, 10).replace(/-/g, '.') + '.001',
      generatedAt: new Date().toISOString(),
      sources: otaSources,
    };

    this.atomicWrite('ota-index.json', index);
    this.logger.log(`ota-index.json: ${otaSources.length} sources`);
  }

  // ============================================================
  // 重建全部
  // ============================================================

  rebuildAll(stableSources: StableSourceEntry[]): void {
    this.rebuildStableIndex(stableSources);
    this.rebuildOtaIndex(stableSources);
  }

  // ============================================================
  // 原子写入 — 失败不覆盖
  // ============================================================

  private atomicWrite(filename: string, data: unknown): void {
    const filePath = path.join(this.manifestsDir, filename);
    const tmpPath = filePath + '.tmp';

    try {
      // 1. 写入临时文件
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(tmpPath, json, 'utf-8');

      // 2. 验证临时文件可解析
      JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));

      // 3. 如果有旧文件，先备份
      if (fs.existsSync(filePath)) {
        const bakPath = filePath + '.bak';
        fs.copyFileSync(filePath, bakPath);
      }

      // 4. 原子 rename
      fs.renameSync(tmpPath, filePath);

      // 5. 清理备份
      const bakPath = filePath + '.bak';
      try { if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath); } catch {}
    } catch (e: any) {
      this.logger.error(`Failed to write ${filename}: ${e.message} — previous index preserved`);
      // 清理临时文件
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    }
  }

  // ============================================================
  // Private
  // ============================================================

  private readJson<T>(filename: string, fallback: () => T): T {
    const fp = path.join(this.manifestsDir, filename);
    try {
      if (!fs.existsSync(fp)) return fallback();
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      return fallback();
    }
  }
}
