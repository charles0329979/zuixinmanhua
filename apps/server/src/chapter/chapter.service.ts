import { Injectable, Logger } from '@nestjs/common';
import { SourcePlatformService } from '../source-platform/source-platform.service';

@Injectable()
export class ChapterService {
  private readonly logger = new Logger(ChapterService.name);

  constructor(private readonly platform: SourcePlatformService) {}

  async getChapterImages(source: string, comicId: string, chapterId: string) {
    try {
      return await this.platform.getImages(source, comicId, chapterId);
    } catch (e: any) {
      if (e.message?.includes('not found')) {
        throw new Error(`书源 ${source} 不存在或已停用`);
      }
      this.logger.warn(`Images failed for ${source}/${comicId}/${chapterId}: ${e.message}`);
      throw new Error(`${source} 图片获取失败: ${e.message}`);
    }
  }
}
