// ============================================================
// packages/source-core/src/adapters/base.adapter.ts
// ★ BaseAdapter — 所有书源适配器基类
// V2 关键改动: 不再硬依赖 axios，改为注入 IHttpClient
// ============================================================

import type {
  ISourceAdapter,
  ComicInfo,
  ChapterInfo,
  ChapterDetail,
  AdapterContext,
} from '@zuixinmanhua/types';
import { CircuitBreakerError, detectBlockPattern } from '@zuixinmanhua/types';
import type { IHttpClient, HttpRequestConfig, HttpResponse } from '@zuixinmanhua/network';

export abstract class BaseAdapter implements ISourceAdapter {
  abstract id: string;
  abstract name: string;
  abstract testTargets: { comicId?: string; chapterId?: string };

  protected ctx: AdapterContext;
  protected http: IHttpClient; // ★ 注入，不再是 import axios

  constructor(ctx: AdapterContext, httpClient: IHttpClient) {
    this.ctx = ctx;
    this.http = httpClient;
  }

  get domain(): string {
    return this.ctx.baseUrl;
  }

  // ========== 子类必须实现 ==========
  abstract search(query: string): Promise<ComicInfo[]>;
  abstract getComicDetail(comicId: string): Promise<ComicInfo>;
  abstract getChapters(comicId: string): Promise<ChapterInfo[]>;
  abstract getChapterImages(
    comicId: string,
    chapterId: string,
  ): Promise<ChapterDetail>;

  // ========== 统一 HTTP 方法 ==========

  /** GET 请求 — 自动拼接 baseUrl + 重试 + 反爬检测 */
  protected async fetch(
    pathOrUrl: string,
    opts?: HttpRequestConfig,
  ): Promise<HttpResponse> {
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${this.ctx.baseUrl}${pathOrUrl}`;

    const config: HttpRequestConfig = {
      timeout: this.ctx.timeout,
      headers: {
        'User-Agent': this.ctx.userAgent,
        ...(this.ctx.headers || {}),
        ...(opts?.headers || {}),
      },
      ...opts,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.ctx.retries; attempt++) {
      try {
        const response = await this.http.get(url, config);

        // 熔断检测
        if (response.status === 403) {
          throw new CircuitBreakerError(
            'HTTP 403 Forbidden',
            this.id,
            'http_403',
          );
        }
        if (response.status === 429) {
          throw new CircuitBreakerError(
            'HTTP 429 Too Many Requests',
            this.id,
            'http_429',
          );
        }

        // 反爬特征检测
        if (typeof response.data === 'string') {
          const blockErr = detectBlockPattern(response.data);
          if (blockErr) {
            blockErr.sourceId = this.id;
            throw blockErr;
          }
        }

        return response;
      } catch (e: unknown) {
        if (e instanceof CircuitBreakerError) throw e;
        lastError = e;
        if (attempt < this.ctx.retries) {
          await this.sleep(500 * (attempt + 1));
        }
      }
    }
    throw lastError;
  }

  /** HEAD 请求 — 用于健康检测 */
  protected async head(
    pathOrUrl: string,
  ): Promise<HttpResponse> {
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${this.ctx.baseUrl}${pathOrUrl}`;
    return this.http.head(url, {
      timeout: 5000,
      headers: { 'User-Agent': this.ctx.userAgent },
    });
  }

  /** POST 请求 */
  protected async post(
    pathOrUrl: string,
    data?: unknown,
    opts?: HttpRequestConfig,
  ): Promise<HttpResponse> {
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${this.ctx.baseUrl}${pathOrUrl}`;
    return this.http.post(url, data, {
      timeout: this.ctx.timeout,
      headers: {
        'User-Agent': this.ctx.userAgent,
        'Content-Type': 'application/json',
        ...(opts?.headers || {}),
      },
      ...opts,
    });
  }

  // ========== 通用工具 ==========

  protected extractId(url: string): string {
    return url
      .replace(/\/comic\//, '')
      .replace(/\/book\//, '')
      .replace(/\/chapter\//, '')
      .replace(/\/view\//, '')
      .replace(/\/info\//, '')
      .replace(/\.html/, '')
      .replace(/\/$/, '')
      .replace(/\//g, '');
  }

  protected parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (/完结|完結|completed/i.test(text)) return 'completed';
    if (/停更|休刊|hiatus/i.test(text)) return 'hiatus';
    return 'ongoing';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
