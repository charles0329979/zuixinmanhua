import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { SourceAdapter, ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';
import { CircuitBreakerError, detectBlockPattern } from '../source-policy.types';

/**
 * BaseAdapter — 所有书源适配器的基类
 * 提供统一的 HTTP 请求、重试、错误处理，子类只需关注 HTML/JSON 解析
 */
export abstract class BaseAdapter implements SourceAdapter {
  abstract id: string;
  abstract name: string;
  abstract testTargets: { comicId?: string; chapterId?: string };

  protected ctx: AdapterContext;

  constructor(ctx: AdapterContext) {
    this.ctx = ctx;
  }

  get domain(): string {
    return this.ctx.baseUrl;
  }

  // ========== 子类必须实现 ==========
  abstract search(query: string): Promise<ComicInfo[]>;
  abstract getComicDetail(comicId: string): Promise<ComicInfo>;
  abstract getChapters(comicId: string): Promise<ChapterInfo[]>;
  abstract getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail>;

  // ========== 共享 HTTP 方法 ==========

  /** 发起 GET 请求，自动拼 baseUrl + 注入 timeout/headers/retry + 反爬检测 */
  protected async fetch(pathOrUrl: string, opts?: AxiosRequestConfig): Promise<AxiosResponse> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.ctx.baseUrl}${pathOrUrl}`;
    const config: AxiosRequestConfig = {
      timeout: this.ctx.timeout,
      headers: {
        'User-Agent': this.ctx.userAgent,
        ...(opts?.headers || {}),
      },
      ...opts,
    };

    let lastError: any;
    for (let attempt = 0; attempt <= this.ctx.retries; attempt++) {
      try {
        const response = await axios.get(url, config);

        // 熔断检测: HTTP 状态码
        if (response.status === 403) {
          throw new CircuitBreakerError('HTTP 403 Forbidden', this.id, 'http_403');
        }
        if (response.status === 429) {
          throw new CircuitBreakerError('HTTP 429 Too Many Requests', this.id, 'http_429');
        }

        // 熔断检测: 响应内容包含反爬特征
        if (typeof response.data === 'string') {
          const blockErr = detectBlockPattern(response.data);
          if (blockErr) {
            blockErr.sourceId = this.id;
            throw blockErr;
          }
        }

        return response;
      } catch (e: any) {
        // CircuitBreakerError 直接抛出，不重试
        if (e instanceof CircuitBreakerError) throw e;

        lastError = e;
        if (attempt < this.ctx.retries) {
          await this.sleep(500 * (attempt + 1)); // 渐进式退避
        }
      }
    }
    throw lastError;
  }

  /** 发起 HEAD 请求（用于健康检测） */
  protected async head(pathOrUrl: string): Promise<AxiosResponse> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.ctx.baseUrl}${pathOrUrl}`;
    return axios.head(url, {
      timeout: 5000,
      headers: { 'User-Agent': this.ctx.userAgent },
      validateStatus: (s) => s < 500,
    });
  }

  /** 发起 POST 请求 */
  protected async post(pathOrUrl: string, data?: any, opts?: AxiosRequestConfig): Promise<AxiosResponse> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.ctx.baseUrl}${pathOrUrl}`;
    return axios.post(url, data, {
      timeout: this.ctx.timeout,
      headers: {
        'User-Agent': this.ctx.userAgent,
        'Content-Type': 'application/json',
        ...(opts?.headers || {}),
      },
      ...opts,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
