import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';

@Injectable()
export class ComicService {
  private readonly logger = new Logger(ComicService.name);

  constructor(private readonly sourcesService: SourcesService) {}

  /** 获取漫画详情 */
  async getComicDetail(source: string, comicId: string) {
    const adapter = this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不存在或已停用`);
    return adapter.getComicDetail(comicId);
  }

  /** 获取漫画章节列表 */
  async getChapters(source: string, comicId: string) {
    const adapter = this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不存在或已停用`);
    return adapter.getChapters(comicId);
  }
}
