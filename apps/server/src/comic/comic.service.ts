import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { sourceStore } from '../sources/source-store';
import { getDetailBySource, getChaptersBySource } from '../sources/source-parser';
import { CircuitBreakerError } from '../sources/source-policy.types';

@Injectable()
export class ComicService {
  private readonly logger = new Logger(ComicService.name);
  constructor(private readonly sourcesService: SourcesService) {}

  async getComicDetail(source: string, comicId: string) {
    // Try hardcoded adapter first
    const adapter = await this.sourcesService.getAdapter(source);
    if (adapter) {
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

    // Fall back to rule-based source
    const ruleSource = sourceStore.getSourceById(source);
    if (ruleSource && ruleSource.enabled) {
      try {
        // For rule-based sources, comicId is the detail URL
        const detailUrl = decodeURIComponent(comicId);
        const detail = await getDetailBySource(ruleSource, detailUrl);
        return {
          comicId,
          title: detail.title || '',
          author: detail.author || '',
          cover: detail.cover || '',
          status: detail.status || 'ongoing',
          description: detail.description || '',
          source,
        };
      } catch (e: any) {
        this.logger.warn(`Rule-based detail failed for ${source}/${comicId}: ${e.message}`);
        throw new HttpException(
          { message: `${source} 详情获取失败: ${e.message}`, clientFallback: false },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    throw new HttpException(
      { message: `书源 ${source} 不可用（可能需要客户端直连访问）`, clientFallback: true },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async getChapters(source: string, comicId: string) {
    // Try hardcoded adapter first
    const adapter = await this.sourcesService.getAdapter(source);
    if (adapter) {
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

    // Fall back to rule-based source
    const ruleSource = sourceStore.getSourceById(source);
    if (ruleSource && ruleSource.enabled) {
      try {
        const detailUrl = decodeURIComponent(comicId);
        const chapters = await getChaptersBySource(ruleSource, detailUrl);
        return (chapters || []).map((ch: any, i: number) => ({
          chapterId: encodeURIComponent(ch.url || ch.link || ''),
          title: ch.title || '',
          url: ch.url || ch.link || '',
          index: i,
        }));
      } catch (e: any) {
        this.logger.warn(`Rule-based chapters failed for ${source}/${comicId}: ${e.message}`);
        throw new HttpException(
          { message: `${source} 章节获取失败: ${e.message}`, clientFallback: false },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    throw new HttpException(
      { message: `书源 ${source} 不可用（可能需要客户端直连访问）`, clientFallback: true },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
