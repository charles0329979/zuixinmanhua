// ============================================================
// apps/server/src/sources/adapters/legado.adapter.ts
// LegadoAdapter — wraps JS-powered MangaSource via QuickJS engine
// ============================================================

import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';
import type { JsEngineService, JsRulesConfig, JsExecutionContext } from '../js-engine.service';

export interface JsSourceDefinition {
  id: string;
  name: string;
  host: string;
  jsRules: JsRulesConfig;
  testTargets?: { comicId?: string; chapterId?: string };
}

export class LegadoAdapter extends BaseAdapter {
  id: string;
  name: string;
  testTargets: { comicId?: string; chapterId?: string } = {};

  constructor(
    ctx: AdapterContext,
    private readonly jsEngine: JsEngineService,
    private readonly source: JsSourceDefinition,
  ) {
    super(ctx);
    this.id = source.id;
    this.name = source.name;
    this.testTargets = source.testTargets ?? {};
  }

  private get context(): JsExecutionContext {
    return { sourceId: this.id, sourceName: this.name, sourceHost: this.source.host };
  }

  private get rules(): JsRulesConfig {
    return this.source.jsRules;
  }

  async search(query: string): Promise<ComicInfo[]> {
    return this.jsEngine.executeScript<ComicInfo[]>(
      this.context, 'search', { query }, this.rules,
    );
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    return this.jsEngine.executeScript<ComicInfo>(
      this.context, 'getComicDetail', { comicId }, this.rules,
    );
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    return this.jsEngine.executeScript<ChapterInfo[]>(
      this.context, 'getChapters', { comicId }, this.rules,
    );
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    return this.jsEngine.executeScript<ChapterDetail>(
      this.context, 'getChapterImages', { comicId, chapterId }, this.rules,
    );
  }
}
