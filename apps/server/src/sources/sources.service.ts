import { Injectable, Logger } from '@nestjs/common';
import { SourceAdapter } from './adapter.interface';
import { ManwaAdapter } from './adapters/manwa';
import { YemanAdapter } from './adapters/yeman';
import { CopyAdapter } from './adapters/copy';
import { BaoziAdapter } from './adapters/baozi';
import { DongmanZhijiaAdapter } from './adapters/dongmanzhijia';

export interface SourceWithStatus {
  adapter: SourceAdapter;
  enabled: boolean;
}

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);
  private sources: Map<string, SourceWithStatus> = new Map();

  constructor() {
    this.registerAll();
  }

  /** 注册所有内置书源 */
  private registerAll() {
    const adapters: SourceAdapter[] = [
      new ManwaAdapter(),
      new YemanAdapter(),
      new CopyAdapter(),
      new BaoziAdapter(),
      new DongmanZhijiaAdapter(),
    ];

    for (const adapter of adapters) {
      this.sources.set(adapter.id, { adapter, enabled: true });
      this.logger.log(`✅ 已注册书源: ${adapter.name} (${adapter.id})`);
    }
  }

  /** 获取所有书源（包括启用状态） */
  getAllSources() {
    return Array.from(this.sources.entries()).map(([id, entry]) => ({
      id,
      name: entry.adapter.name,
      domain: entry.adapter.domain,
      enabled: entry.enabled,
    }));
  }

  /** 获取所有已启用的适配器 */
  getEnabledAdapters(): SourceAdapter[] {
    return Array.from(this.sources.values())
      .filter((s) => s.enabled)
      .map((s) => s.adapter);
  }

  /** 根据 ID 获取适配器 */
  getAdapter(id: string): SourceAdapter | undefined {
    const entry = this.sources.get(id);
    return entry?.enabled ? entry.adapter : undefined;
  }

  /** 切换书源启用状态 */
  toggleSource(id: string, enabled: boolean) {
    const entry = this.sources.get(id);
    if (entry) {
      entry.enabled = enabled;
      this.logger.log(`${enabled ? '✅' : '❌'} 书源 ${entry.adapter.name}: ${enabled ? '启用' : '停用'}`);
      return true;
    }
    return false;
  }

  /** 测试书源搜索 */
  async testSearch(id: string) {
    const adapter = this.getAdapter(id);
    if (!adapter) throw new Error('书源不存在或已停用');
    const start = Date.now();
    try {
      const results = await adapter.search('测试');
      return { success: true, responseTime: Date.now() - start, resultCount: results.length };
    } catch (e: any) {
      return { success: false, responseTime: Date.now() - start, error: e.message };
    }
  }

  /** 测试书源详情 */
  async testDetail(id: string, comicId: string) {
    const adapter = this.getAdapter(id);
    if (!adapter) throw new Error('书源不存在或已停用');
    const start = Date.now();
    try {
      const detail = await adapter.getComicDetail(comicId);
      return { success: true, responseTime: Date.now() - start, title: detail.title };
    } catch (e: any) {
      return { success: false, responseTime: Date.now() - start, error: e.message };
    }
  }

  /** 测试章节解析 */
  async testChapter(id: string, comicId: string) {
    const adapter = this.getAdapter(id);
    if (!adapter) throw new Error('书源不存在或已停用');
    const start = Date.now();
    try {
      const chapters = await adapter.getChapters(comicId);
      return { success: true, responseTime: Date.now() - start, chapterCount: chapters.length };
    } catch (e: any) {
      return { success: false, responseTime: Date.now() - start, error: e.message };
    }
  }
}
