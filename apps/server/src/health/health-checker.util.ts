import { SourceAdapter } from '../sources/adapter.interface';
import { CircuitBreakerError } from '../sources/source-policy.types';

export interface CheckResult {
  checkType: string;
  isHealthy: boolean;
  statusCode?: number;
  responseTimeMs: number;
  errorType?: string;
  errorMessage?: string;
}

const TEST_KEYWORDS = ['海贼王', '斗破苍穹', '一拳超人'];

/**
 * 健康检测工具 — 5 项纯函数检测
 */
export class HealthChecker {
  /** 检测首页可访问性 */
  static async checkHomepage(adapter: SourceAdapter): Promise<CheckResult> {
    const start = Date.now();
    try {
      // Use the adapter's fetch method (via BaseAdapter) if available
      const { default: axios } = await import('axios');
      const res = await axios.head(adapter.domain + '/', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: (s) => s < 500,
      });
      return {
        checkType: 'homepage',
        isHealthy: true,
        statusCode: res.status,
        responseTimeMs: Date.now() - start,
      };
    } catch (e: any) {
      return {
        checkType: 'homepage',
        isHealthy: false,
        responseTimeMs: Date.now() - start,
        errorType: e.code || 'NETWORK_ERROR',
        errorMessage: e.message?.slice(0, 300),
      };
    }
  }

  /** 检测搜索功能 */
  static async checkSearch(adapter: SourceAdapter): Promise<CheckResult> {
    const start = Date.now();
    const keyword = TEST_KEYWORDS[Math.floor(Math.random() * TEST_KEYWORDS.length)];
    try {
      const results = await adapter.search(keyword);
      return {
        checkType: 'search',
        isHealthy: results.length > 0,
        responseTimeMs: Date.now() - start,
        errorMessage: results.length === 0 ? '搜索返回空结果' : undefined,
      };
    } catch (e: any) {
      const isBlocked = e instanceof CircuitBreakerError;
      return {
        checkType: 'search',
        isHealthy: false,
        responseTimeMs: Date.now() - start,
        errorType: isBlocked ? 'BLOCKED' : 'SEARCH_ERROR',
        errorMessage: e.message?.slice(0, 300),
      };
    }
  }

  /** 检测详情解析 */
  static async checkDetail(adapter: SourceAdapter): Promise<CheckResult> {
    const start = Date.now();
    // 使用 testTargets 中配置的 comicId，或回退到搜索结果
    const comicId = adapter.testTargets?.comicId;
    if (!comicId) {
      // 搜索一个关键词并取第一个结果
      try {
        const results = await adapter.search('海贼王');
        if (results.length === 0) {
          return { checkType: 'detail', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'NO_TEST_DATA', errorMessage: '无测试数据' };
        }
        const detail = await adapter.getComicDetail(results[0].comicId);
        return {
          checkType: 'detail',
          isHealthy: !!detail.title,
          responseTimeMs: Date.now() - start,
        };
      } catch (e: any) {
        return { checkType: 'detail', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'DETAIL_ERROR', errorMessage: e.message?.slice(0, 300) };
      }
    }
    try {
      const detail = await adapter.getComicDetail(comicId);
      return {
        checkType: 'detail',
        isHealthy: !!detail.title,
        responseTimeMs: Date.now() - start,
      };
    } catch (e: any) {
      return { checkType: 'detail', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'DETAIL_ERROR', errorMessage: e.message?.slice(0, 300) };
    }
  }

  /** 检测章节解析 */
  static async checkChapter(adapter: SourceAdapter): Promise<CheckResult> {
    const start = Date.now();
    const comicId = adapter.testTargets?.comicId;
    if (!comicId) {
      // Search for a test comic
      try {
        const results = await adapter.search('海贼王');
        if (results.length === 0) {
          return { checkType: 'chapter', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'NO_TEST_DATA' };
        }
        const chapters = await adapter.getChapters(results[0].comicId);
        return {
          checkType: 'chapter',
          isHealthy: chapters.length > 0,
          responseTimeMs: Date.now() - start,
        };
      } catch (e: any) {
        return { checkType: 'chapter', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'CHAPTER_ERROR', errorMessage: e.message?.slice(0, 300) };
      }
    }
    try {
      const chapters = await adapter.getChapters(comicId);
      return {
        checkType: 'chapter',
        isHealthy: chapters.length > 0,
        responseTimeMs: Date.now() - start,
      };
    } catch (e: any) {
      return { checkType: 'chapter', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'CHAPTER_ERROR', errorMessage: e.message?.slice(0, 300) };
    }
  }

  /** 检测图片解析 */
  static async checkImage(adapter: SourceAdapter): Promise<CheckResult> {
    const start = Date.now();
    try {
      const results = await adapter.search('海贼王');
      if (results.length === 0) {
        return { checkType: 'image', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'NO_TEST_DATA' };
      }
      const chapters = await adapter.getChapters(results[0].comicId);
      if (chapters.length === 0) {
        return { checkType: 'image', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'NO_CHAPTERS' };
      }
      const detail = await adapter.getChapterImages(results[0].comicId, chapters[0].chapterId);
      return {
        checkType: 'image',
        isHealthy: detail.images.length > 0,
        responseTimeMs: Date.now() - start,
      };
    } catch (e: any) {
      return { checkType: 'image', isHealthy: false, responseTimeMs: Date.now() - start, errorType: 'IMAGE_ERROR', errorMessage: e.message?.slice(0, 300) };
    }
  }
}
