// ============================================================
// packages/network/src/middleware/header-injection.ts
// HeaderInjectionMiddleware — 注入默认 UA / Referer / Timeout
// ============================================================

import type { IHttpClient, HttpRequestConfig, HttpResponse } from '../http-client';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class HeaderInjectionMiddleware implements IHttpClient {
  constructor(
    private inner: IHttpClient,
    private defaultHeaders: Record<string, string>,
    private defaultTimeout?: number,
  ) {}

  async get(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    return this.inner.get(url, this.mergeConfig(config));
  }

  async post(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse> {
    return this.inner.post(url, data, this.mergeConfig(config));
  }

  async head(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    return this.inner.head(url, this.mergeConfig(config));
  }

  private mergeConfig(config?: HttpRequestConfig): HttpRequestConfig {
    const merged: HttpRequestConfig = {
      ...config,
      headers: {
        'User-Agent': DEFAULT_UA,
        ...this.defaultHeaders,
        ...(config?.headers || {}),
      },
    };

    if (this.defaultTimeout && !merged.timeout) {
      merged.timeout = this.defaultTimeout;
    }

    return merged;
  }
}
