import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';

@Injectable()
export class ChapterService {
  private readonly logger = new Logger(ChapterService.name);
  constructor(private readonly sourcesService: SourcesService) {}

  async getChapterImages(source: string, comicId: string, chapterId: string) {
    const adapter = await this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不存在或已停用`);
    return adapter.getChapterImages(comicId, chapterId);
  }
}
