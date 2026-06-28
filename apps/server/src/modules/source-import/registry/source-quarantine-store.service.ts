// ============================================================
// apps/server/src/modules/source-import/promotion/source-quarantine.service.ts
// 隔离管理 — 写入/读取 quarantine 目录，管理隔离源列表
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ImportedSourceCandidate } from '../types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SourceQuarantineService {
  private readonly logger = new Logger(SourceQuarantineService.name);
  private readonly quarantineDir: string;

  constructor() {
    this.quarantineDir = path.join(process.cwd(), 'data', 'source-registry', 'quarantine');
  }

  /**
   * 将候选源写入隔离目录
   */
  quarantine(candidate: ImportedSourceCandidate): void {
    fs.mkdirSync(this.quarantineDir, { recursive: true });
    const filePath = path.join(this.quarantineDir, `${candidate.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(candidate, null, 2), 'utf-8');
    this.logger.log(`Quarantined: ${candidate.id} saved to quarantine/`);
  }

  /**
   * 列出所有隔离源
   */
  listAll(): ImportedSourceCandidate[] {
    if (!fs.existsSync(this.quarantineDir)) return [];
    return fs.readdirSync(this.quarantineDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.quarantineDir, f), 'utf-8'));
        } catch { return null; }
      })
      .filter(Boolean) as ImportedSourceCandidate[];
  }

  /**
   * 获取单个隔离源
   */
  getById(id: string): ImportedSourceCandidate | null {
    const filePath = path.join(this.quarantineDir, `${id}.json`);
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * 从隔离目录移除 (重新验证通过后)
   */
  remove(id: string): void {
    const filePath = path.join(this.quarantineDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`Removed from quarantine: ${id}`);
    }
  }

  /**
   * 获取隔离统计
   */
  getStats(): { total: number; reasons: Record<string, number> } {
    const sources = this.listAll();
    const reasons: Record<string, number> = {};
    for (const s of sources) {
      const reason = s.conversionWarnings?.find(w => w.includes('Quarantine')) || 'unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
    return { total: sources.length, reasons };
  }
}
