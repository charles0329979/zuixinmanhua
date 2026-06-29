import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SourcePlatformService } from '../source-platform/source-platform.service';

@Injectable()
export class ComicService {
  private readonly logger = new Logger(ComicService.name);

  constructor(private readonly platform: SourcePlatformService) {}

  async getComicDetail(source: string, comicId: string) {
    try {
      return await this.platform.getDetail(source, comicId);
    } catch (e: any) {
      if (e.message?.includes('not found')) {
        throw new HttpException(
          { message: `书源 ${source} 不可用（可能需要客户端直连访问）`, clientFallback: true },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.warn(`Detail failed for ${source}/${comicId}: ${e.message}`);
      throw new HttpException(
        { message: `${source} 详情获取失败: ${e.message}`, clientFallback: false },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getChapters(source: string, comicId: string) {
    try {
      return await this.platform.getChapters(source, comicId);
    } catch (e: any) {
      if (e.message?.includes('not found')) {
        throw new HttpException(
          { message: `书源 ${source} 不可用（可能需要客户端直连访问）`, clientFallback: true },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.warn(`Chapters failed for ${source}/${comicId}: ${e.message}`);
      throw new HttpException(
        { message: `${source} 章节获取失败: ${e.message}`, clientFallback: false },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
