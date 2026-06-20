import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { sourceStore } from '../sources/source-store';
import { getImagesBySource } from '../sources/source-parser';

@Injectable()
export class ChapterService {
  private readonly logger = new Logger(ChapterService.name);
  constructor(private readonly sourcesService: SourcesService) {}

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
        const images = await getImagesBySource(ruleSource, chapterUrl);
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
