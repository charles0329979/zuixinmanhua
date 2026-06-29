// ============================================================
// source-platform/release/source-quarantine.service.ts (V9)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { SourceRegistryService } from '../registry/source-registry.service';

export interface QuarantineEntry {
  id: string; name: string; reason: string;
  quarantinedAt: string; [key: string]: unknown;
}

@Injectable()
export class SourceQuarantineService {
  private readonly logger = new Logger(SourceQuarantineService.name);

  constructor(private readonly registry: SourceRegistryService) {}

  quarantine(entry: QuarantineEntry): void {
    this.registry.saveQuarantine(entry.id, entry as unknown as Record<string, unknown>);
    this.logger.log(`Quarantined: ${entry.id} — ${entry.reason}`);
  }

  remove(id: string): void { this.registry.remove('quarantine', id); }

  listAll(): QuarantineEntry[] {
    return this.registry.listQuarantine() as unknown as QuarantineEntry[];
  }

  getStats(): { total: number; reasons: Record<string, number> } {
    const all = this.listAll();
    const reasons: Record<string, number> = {};
    for (const e of all) { const r = e.reason || 'Unknown'; reasons[r] = (reasons[r] || 0) + 1; }
    return { total: all.length, reasons };
  }
}
