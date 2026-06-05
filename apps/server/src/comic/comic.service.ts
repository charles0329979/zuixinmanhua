import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { CircuitBreakerError } from '../sources/source-policy.types';

@Injectable()
export class ComicService {
  private readonly logger = new Logger(ComicService.name);
  constructor(private readonly sourcesService: SourcesService) {}

  async getComicDetail(source: string, comicId: string) {
    const adapter = await this.sourcesService.getAdapter(source);
    if (!adapter) {
      throw new HttpException(
        { message: `书源 ${source} 不可用（可能需要客户端直连访问）`, clientFallback: true },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      return await adapter.getComicDetail(comicId);
    } catch (e: any) {
      if (e instanceof CircuitBreakerError) {
        throw new HttpException(
          { message: `${source} 服务端访问被反爬拦截，请在原站阅读`, clientFallback: true, sourceUrl: `https://www.yemancomic.com/book/${comicId}/` },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
  }

  async getChapters(source: string, comicId: string) {
    const adapter = await this.sourcesService.getAdapter(source);
    if (!adapter) {
      throw new HttpException(
        { message: `书源 ${source} 不可用（可能需要客户端直连访问）`, clientFallback: true },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      return await adapter.getChapters(comicId);
    } catch (e: any) {
      if (e instanceof CircuitBreakerError) {
        throw new HttpException(
          { message: `${source} 章节列表被反爬拦截，请在原站阅读`, clientFallback: true },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
  }
}
