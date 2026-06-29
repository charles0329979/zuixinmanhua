// ============================================================
// apps/server/src/modules/source-import/validation/source-search-validator.service.ts
// Layer 2: 搜索验证 — 用可配置关键词池测试搜索功能
//
// ★ V7: 通过 SourceRuntimeService 执行搜索 (唯一执行入口)。
// 不再直接调用 source-parser。
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { SearchCheckDetail } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import { SourceRuntimeService } from '../../../source-platform/runtime/source-runtime.service';
import { DriverRegistryService } from '../../../source-platform/runtime/driver-registry.service';
import { RuleSourceDriver } from '../../../source-platform/runtime/rule-source-driver';

/**
 * 默认测试关键词池 — 覆盖中/英/日常见漫画名称
 */
const DEFAULT_KEYWORDS = [
  '海贼王',
  '火影忍者',
  'one piece',
  'naruto',
  '1',
  'a',
];

@Injectable()
export class SourceSearchValidatorService {
  private readonly logger = new Logger(SourceSearchValidatorService.name);

  constructor(
    private readonly runtime: SourceRuntimeService,
    private readonly driverRegistry: DriverRegistryService,
  ) {}

  /**
   * Layer 2 搜索验证 (通过 SourceRuntimeService)
   */
  async validate(
    source: MangaSource,
    keywords: string[] = DEFAULT_KEYWORDS,
    timeoutMs: number = 8000,
  ): Promise<{ passed: boolean; detail: SearchCheckDetail }> {
    const startTime = Date.now();
    const detail: SearchCheckDetail = {
      keywords,
      resultsPerKeyword: {},
      totalMs: 0,
    };

    // ★ 创建临时 driver 并通过 SourceRuntime 执行
    const driver = new RuleSourceDriver(source);
    this.driverRegistry.register(driver);

    try {
      let anySuccess = false;

      for (const keyword of keywords) {
        try {
          const results = await Promise.race([
            this.runtime.search(driver.sourceId, { keyword }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('SEARCH_TIMEOUT')), timeoutMs),
            ),
          ]);

          if (results && results.length > 0) {
            detail.resultsPerKeyword[keyword] = results.length;

            const firstValid = results.find(
              r => r.title && r.title.length > 0 && r.detailUrl && r.detailUrl.length > 0,
            );

            if (firstValid) {
              detail.firstResultTitle = firstValid.title;
              detail.firstResultUrl = firstValid.detailUrl;
              anySuccess = true;
              this.logger.log(
                `Search OK for ${source.id}: "${keyword}" → ${results.length} results, ` +
                `first: "${firstValid.title?.slice(0, 30)}"`,
              );
            } else {
              detail.resultsPerKeyword[keyword] = results.length;
              this.logger.warn(
                `Search results for ${source.id} "${keyword}": ${results.length} results but none with valid title+url`,
              );
            }
          } else {
            detail.resultsPerKeyword[keyword] = 0;
          }
        } catch (e: any) {
          detail.resultsPerKeyword[keyword] = -1;
          this.logger.debug(
            `Search failed for ${source.id} "${keyword}": ${e.message?.slice(0, 80)}`,
          );
        }

        if (anySuccess) break;
      }

      detail.totalMs = Date.now() - startTime;
      return { passed: anySuccess, detail };
    } finally {
      // 清理临时 driver
      try { this.driverRegistry.unregister(driver.sourceId); } catch {}
    }
  }
}
