import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { ComicInfo } from '../sources/adapter.interface';

export interface SourceSearchResult {
  source: string;
  sourceName: string;
  results: ComicInfo[];
  error?: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly sourcesService: SourcesService) {}

  /**
   * 在所有已启用的书源中并发搜索
   * 返回每个书源的独立搜索结果（不合并）
   */
  async searchAll(query: string): Promise<SourceSearchResult[]> {
    if (!query || query.trim().length === 0) return [];

    const adapters = this.sourcesService.getEnabledAdapters();
    this.logger.log(`🔍 搜索 "${query}" — 共 ${adapters.length} 个书源`);

    const promises = adapters.map(async (adapter) => {
      try {
        const start = Date.now();
        const results = await adapter.search(query.trim());
        const elapsed = Date.now() - start;
        this.logger.log(`  ✅ ${adapter.name}: ${results.length} 条结果 (${elapsed}ms)`);
        return {
          source: adapter.id,
          sourceName: adapter.name,
          results,
        };
      } catch (error: any) {
        this.logger.warn(`  ❌ ${adapter.name}: ${error.message}`);
        return {
          source: adapter.id,
          sourceName: adapter.name,
          results: [],
          error: error.message,
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * 在单个书源中搜索
   */
  async searchOne(source: string, query: string): Promise<SourceSearchResult> {
    const adapter = this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不存在或已停用`);

    try {
      const results = await adapter.search(query.trim());
      return { source: adapter.id, sourceName: adapter.name, results };
    } catch (error: any) {
      return { source: adapter.id, sourceName: adapter.name, results: [], error: error.message };
    }
  }
}
