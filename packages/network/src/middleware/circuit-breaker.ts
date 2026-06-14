// ============================================================
// packages/network/src/middleware/circuit-breaker.ts
// CircuitBreakerMiddleware — 检测 403/429/反爬，抛 CircuitBreakerError
// ============================================================

import type { IHttpClient, HttpRequestConfig, HttpResponse } from '../http-client';
import { CircuitBreakerError, detectBlockPattern } from '@zuixinmanhua/types';

export interface CircuitBreakerConfig {
  sourceId: string;
}

export class CircuitBreakerMiddleware implements IHttpClient {
  constructor(
    private inner: IHttpClient,
    private config: CircuitBreakerConfig,
  ) {}

  async get(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    const response = await this.inner.get(url, config);
    this.check(response);
    return response;
  }

  async post(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse> {
    const response = await this.inner.post(url, data, config);
    this.check(response);
    return response;
  }

  async head(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    const response = await this.inner.head(url, config);
    // HEAD 不检查反爬特征（无 body）
    if (response.status === 403) {
      throw new CircuitBreakerError('HTTP 403 Forbidden', this.config.sourceId, 'http_403');
    }
    if (response.status === 429) {
      throw new CircuitBreakerError('HTTP 429 Too Many Requests', this.config.sourceId, 'http_429');
    }
    return response;
  }

  private check(response: HttpResponse): void {
    const sourceId = this.config.sourceId;

    if (response.status === 403) {
      throw new CircuitBreakerError('HTTP 403 Forbidden', sourceId, 'http_403');
    }
    if (response.status === 429) {
      throw new CircuitBreakerError('HTTP 429 Too Many Requests', sourceId, 'http_429');
    }

    // 检测 body 中的反爬特征
    if (typeof response.data === 'string') {
      const blockErr = detectBlockPattern(response.data);
      if (blockErr) {
        blockErr.sourceId = sourceId;
        throw blockErr;
      }
    }
  }
}
