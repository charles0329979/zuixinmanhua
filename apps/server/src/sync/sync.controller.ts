// ============================================================
// apps/server/src/sync/sync.controller.ts
// ★ Sync API — 供 React Native App 调用 (V6: 通过 source-platform)
// ============================================================

import { Controller, Get, Query, Logger } from '@nestjs/common';
import { SourcePlatformService } from '../source-platform/source-platform.service';
import { DriverRegistryService } from '../source-platform/runtime/driver-registry.service';

@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private readonly platform: SourcePlatformService,
    private readonly driverRegistry: DriverRegistryService,
  ) {}

  @Get('sources')
  getSources() {
    const drivers = this.driverRegistry.listAll();
    return {
      version: '2.0.0',
      updatedAt: new Date().toISOString(),
      sources: drivers.map(d => ({
        id: d.sourceId,
        name: d.sourceName,
        host: (d as any).host || '',
        capabilities: { search: true, detail: true, chapters: true, images: true },
      })),
      count: drivers.length,
    };
  }

  @Get('source')
  getSource(@Query('id') id: string) {
    const driver = this.driverRegistry.getOptional(id);
    if (driver) {
      return {
        id: driver.sourceId,
        name: driver.sourceName,
        host: (driver as any).host || '',
        capabilities: { search: true, detail: true, chapters: true, images: true },
      };
    }
    return { error: 'Source not found', id };
  }
}
