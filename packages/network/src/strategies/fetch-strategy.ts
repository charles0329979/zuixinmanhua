// ============================================================
// packages/network/src/strategies/fetch-strategy.ts
// FetchHttpClient — 使用平台原生 fetch() (RN + Web)
// ============================================================

import type {
  IHttpClient,
  HttpRequestConfig,
  HttpResponse,
} from '../http-client';

export class FetchHttpClient implements IHttpClient {
  async get(
    url: string,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse> {
    return this.request('GET', url, undefined, config);
  }

  async post(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse> {
    return this.request('POST', url, data, config);
  }

  async head(
    url: string,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse> {
    return this.request('HEAD', url, undefined, config);
  }

  private async request(
    method: string,
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const signal = config?.signal || controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (config?.timeout) {
      timer = setTimeout(() => controller.abort(), config.timeout);
    }

    try {
      const init: RequestInit = {
        method,
        headers: config?.headers,
        signal,
      };

      if (data !== undefined) {
        init.body =
          typeof data === 'string' ? data : JSON.stringify(data);
        if (!config?.headers?.['Content-Type'] && !config?.headers?.['content-type']) {
          (init.headers as Record<string, string>)['Content-Type'] =
            'application/json';
        }
      }

      const response = await fetch(url, init);
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      const contentType =
        respHeaders['content-type'] || 'text/plain';
      const isJson = contentType.includes('application/json');
      const responseData = isJson
        ? await response.json()
        : await response.text();

      return {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
        data: responseData,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
