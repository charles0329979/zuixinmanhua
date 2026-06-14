// ============================================================
// packages/network/src/middleware/retry.ts
// RetryMiddleware — 请求失败自动重试 (指数退避)
// ============================================================

import type { IHttpClient, HttpRequestConfig, HttpResponse } from '../http-client';
import { CircuitBreakerError } from '@zuixinmanhua/types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryMiddleware implements IHttpClient {
  constructor(
    private inner: IHttpClient,
    private maxRetries: number = 3,
    private baseDelayMs: number = 500,
  ) {}

  async get(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    return this.withRetry(() => this.inner.get(url, config));
  }

  async post(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse> {
    return this.withRetry(() => this.inner.post(url, data, config));
  }

  async head(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    return this.withRetry(() => this.inner.head(url, config));
  }

  private async withRetry(fn: () => Promise<HttpResponse>): Promise<HttpResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        // CircuitBreakerError 不重试，直接抛
        if (e instanceof CircuitBreakerError) throw e;
        if (attempt < this.maxRetries) {
          await sleep(this.baseDelayMs * (attempt + 1));
        }
      }
    }
    throw lastError;
  }
}
