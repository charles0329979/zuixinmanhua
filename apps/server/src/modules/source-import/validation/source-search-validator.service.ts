// ============================================================
// apps/server/src/modules/source-import/validation/source-search-validator.service.ts
// Layer 2: 搜索验证 — 用可配置关键词池测试搜索功能
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { SearchCheckDetail } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import { searchBySource } from '../../../sources/source-parser';

/**
 * 默认测试关键词池 — 覆盖中/英/日常见漫画名称
 * 按成功率排序: 先试中文(国产/汉化站)，再试日文罗马字，最后用短字符串兜底
 */
const DEFAULT_KEYWORDS = [
  '海贼王',        // 中文: One Piece — 覆盖国漫站/汉化站
  '火影忍者',      // 中文: Naruto
  'one piece',    // 日文罗马字: 覆盖日漫站/英文站
  'naruto',       // 日文罗马字
  '1',            // 短字符串兜底 — 覆盖按更新时间排序的站
  'a',            // 单字母兜底
];

@Injectable()
export class SourceSearchValidatorService {
  private readonly logger = new Logger(SourceSearchValidatorService.name);

  /**
   * Layer 2 搜索验证
   *
   * @param source    书源定义
   * @param keywords  测试关键词 (默认使用池中全部)
   * @param timeoutMs 单次搜索超时 (ms)
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

    let anySuccess = false;

    // 逐个关键词测试，取第一个成功的结果
    for (const keyword of keywords) {
      try {
        const results = await Promise.race([
          searchBySource(source, keyword),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SEARCH_TIMEOUT')), timeoutMs),
          ),
        ]);

        if (results && results.length > 0) {
          detail.resultsPerKeyword[keyword] = results.length;

          // 验证结果结构完整性 (AggregatedComicResult 使用 detailUrl 字段)
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
        detail.resultsPerKeyword[keyword] = -1; // -1 = error
        this.logger.debug(
          `Search failed for ${source.id} "${keyword}": ${e.message?.slice(0, 80)}`,
        );
      }

      // 如果已有一个关键词成功，跳出
      if (anySuccess) break;
    }

    detail.totalMs = Date.now() - startTime;
    return { passed: anySuccess, detail };
  }
}
