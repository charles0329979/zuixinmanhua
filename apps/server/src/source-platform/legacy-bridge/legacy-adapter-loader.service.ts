// ============================================================
// source-platform/legacy-bridge/legacy-adapter-loader.service.ts
// LegacyAdapterLoaderService — 旧适配器桥接层
//
// 将旧的 AdapterFactoryService 封装，只供 SourcePlatformModule 在启动时使用。
// 其他任何模块不得直接导入此 Service。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { AdapterFactoryService } from '../../sources/adapter-factory.service';
import { AdapterSourceDriver } from '../runtime/adapter-source-driver';
import type { ISourceDriver } from '../runtime/source-driver.interface';

@Injectable()
export class LegacyAdapterLoaderService {
  private readonly logger = new Logger(LegacyAdapterLoaderService.name);

  constructor(private readonly adapterFactory: AdapterFactoryService) {}

  /** 加载所有启用的旧适配器，包装为 AdapterSourceDriver */
  async loadAllEnabled(): Promise<ISourceDriver[]> {
    try {
      const adapters = await this.adapterFactory.createAllEnabled();
      return adapters.map(adapter => new AdapterSourceDriver(adapter));
    } catch (e: any) {
      this.logger.warn(`Failed to load adapters: ${e.message}`);
      return [];
    }
  }
}
