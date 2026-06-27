import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { sourceStore } from '../sources/source-store';
import { getImagesBySource } from '../sources/source-parser';
import { JsEngineService } from '../sources/js-engine.service';

@Injectable()
export class ChapterService {
  private readonly logger = new Logger(ChapterService.name);
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly jsEngine: JsEngineService,
  ) {}

  async getChapterImages(source: string, comicId: string, chapterId: string) {
    // Try hardcoded adapter first
    const adapter = await this.sourcesService.getAdapter(source);
    if (adapter) {
      return adapter.getChapterImages(comicId, chapterId);
    }

    // Fall back to rule-based source
    const ruleSource = sourceStore.getSourceById(source);
    if (ruleSource && ruleSource.enabled) {
      try {
        const chapterUrl = decodeURIComponent(chapterId);

        // Build JS executor for @js: expressions
        let jsExec: any = undefined;
        const srcAny = ruleSource as any;
        if (srcAny.jsRules) {
          const ctx = { sourceId: source, sourceName: ruleSource.name, sourceHost: ruleSource.host };
          jsExec = (jsCode: string, vars: Record<string, any>) =>
            this.jsEngine.executeLegadoJs(ctx, jsCode, vars, srcAny.jsRules);
        }

        const images = await getImagesBySource(ruleSource, chapterUrl, jsExec);
        const comicTitle = ruleSource.name || source;
        return {
          chapterId,
          comicTitle,
          chapterTitle: '',
          images: images || [],
        };
      } catch (e: any) {
        this.logger.warn(`Rule-based images failed for ${source}/${comicId}/${chapterId}: ${e.message}`);
        throw new Error(`${source} 图片获取失败: ${e.message}`);
      }
    }

    throw new Error(`书源 ${source} 不存在或已停用`);
  }
}
