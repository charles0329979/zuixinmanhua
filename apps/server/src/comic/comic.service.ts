import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';

@Injectable()
export class ComicService {
  private readonly logger = new Logger(ComicService.name);
  constructor(private readonly sourcesService: SourcesService) {}

  async getComicDetail(source: string, comicId: string) {
    const adapter = await this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不存在或已停用`);
    return adapter.getComicDetail(comicId);
  }

  async getChapters(source: string, comicId: string) {
    const adapter = await this.sourcesService.getAdapter(source);
    if (!adapter) throw new Error(`书源 ${source} 不存在或已停用`);
    return adapter.getChapters(comicId);
  }
}
