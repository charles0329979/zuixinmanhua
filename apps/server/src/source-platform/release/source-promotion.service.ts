// ============================================================
// source-platform/release/source-promotion.service.ts
// SourcePromotionService — 源提升到 stable (V9)
//
// 通过 SourceRegistryService 操作 registry/stable/。
// 重建 manifests/stable-index.json 和 manifests/ota-index.json。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { SourceRegistryService, StableSourceEntry } from '../registry/source-registry.service';
import { SourceManifestService } from '../registry/source-manifest.service';
import { SourceVersionService } from '../registry/source-version.service';

@Injectable()
export class SourcePromotionService {
  private readonly logger = new Logger(SourcePromotionService.name);

  constructor(
    private readonly registry: SourceRegistryService,
    private readonly manifest: SourceManifestService,
    private readonly version: SourceVersionService,
  ) {}

  /**
   * 提升源到 stable
   *
   * @param entry      源条目
   * @param healthScore 可选健康分。提供时: < 85 拒绝; ≥85 记录真实分数。
   *                    不提供时: 允许 (rollback / 兼容旧调用)，但设为 0 标记未验证。
   */
  promote(entry: StableSourceEntry, healthScore?: number): { ok: boolean; reason?: string } {
    if (healthScore !== undefined && healthScore < 85) {
      const reason = `Health score ${healthScore} < 85 threshold — must pass full-chain validation`;
      this.logger.warn(`Promote blocked: ${entry.id} — ${reason}`);
      return { ok: false, reason };
    }

    // 记录真实健康分（通过验证的源），或标记为未验证
    const entryToWrite = { ...entry, healthScore: healthScore ?? 0 };
    this.registry.publishStable(entryToWrite);
    this.manifest.rebuildAll(this.registry.listStable());
    this.logger.log(`Promoted: ${entry.id} v${entry.version} (health=${entryToWrite.healthScore}${healthScore === undefined ? ', unvalidated' : ''})`);
    return { ok: true };
  }

  /** 列出所有 stable */
  listAllStable(): StableSourceEntry[] {
    return this.registry.listStable();
  }

  /** 获取单个 stable */
  getStable(id: string): StableSourceEntry | null {
    return this.registry.getStable(id);
  }

  /** 从 stable 移除 */
  unpublish(id: string): void {
    this.registry.unpublishStable(id);
    this.manifest.rebuildAll(this.registry.listStable());
    this.logger.log(`Unpublished: ${id}`);
  }

  /** 获取 stable IDs */
  getStableIds(): string[] {
    return this.registry.getStableIds();
  }
}
