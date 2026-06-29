// ============================================================
// source-platform/release/rollback.service.ts
// RollbackService — stable 回滚
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { SourcePromotionService } from './source-promotion.service';
import * as fs from 'fs';
import * as path from 'path';

interface ReleaseHistory {
  id: string;
  versions: { version: string; hash: string; publishedAt: string; source: unknown }[];
}

@Injectable()
export class RollbackService {
  private readonly logger = new Logger(RollbackService.name);
  private readonly historyDir: string;

  constructor(private readonly promotion: SourcePromotionService) {
    this.historyDir = path.join(process.cwd(), 'data', 'source-platform', 'stable', '.history');
    fs.mkdirSync(this.historyDir, { recursive: true });
  }

  /** 回滚到上一个版本 */
  rollback(id: string): { ok: boolean; reason?: string } {
    const history = this.getHistory(id);
    if (!history || history.versions.length < 2) {
      return { ok: false, reason: `No previous version to rollback for ${id}` };
    }

    // 当前版本 = 最后一个, 回滚目标 = 倒数第二个
    const previous = history.versions[history.versions.length - 2];

    // 写入 stable/{id}.json
    const current = this.promotion.getStable(id);
    if (current) {
      current.version = previous.version;
      current.hash = previous.hash;
      this.promotion.promote(current);
      this.logger.log(`Rolled back ${id} to v${previous.version}`);
      return { ok: true };
    }
    return { ok: false, reason: 'Current stable entry not found' };
  }

  /** 获取回滚历史 */
  private getHistory(id: string): ReleaseHistory | null {
    const filePath = path.join(this.historyDir, `${id}.json`);
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return null; }
  }

  /** 归档当前版本到历史 */
  archiveVersion(id: string, version: string, hash: string, source: unknown): void {
    const filePath = path.join(this.historyDir, `${id}.json`);
    let history: ReleaseHistory = { id, versions: [] };
    try {
      if (fs.existsSync(filePath)) {
        history = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch {}
    history.versions.push({ version, hash, publishedAt: new Date().toISOString(), source });
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
  }
}
