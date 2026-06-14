// ============================================================
// packages/network/src/strategies/axios-strategy.ts
// AxiosHttpClient — 使用 axios (Server 端)
// axios 是可选 peerDependency, 只在 server 安装
// ============================================================

import type {
  IHttpClient,
  HttpRequestConfig,
  HttpResponse,
} from '../http-client';

export class AxiosHttpClient implements IHttpClient {
  private axios: typeof import('axios').default | null = null;

  private async getAxios(): Promise<typeof import('axios').default> {
    if (!this.axios) {
      try {
        this.axios = (await import('axios')).default;
      } catch {
        throw new Error(
          'axios is not installed. Install it in your app or use FetchHttpClient.',
        );
      }
    }
    return this.axios;
  }

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
    const axios = await this.getAxios();

    const response = await axios({
      method: method.toLowerCase() as 'get' | 'post' | 'head',
      url,
      data,
      timeout: config?.timeout,
      headers: config?.headers,
      params: config?.params,
      maxRedirects: config?.maxRedirects ?? 5,
      responseType: config?.responseType === 'stream'
        ? 'stream'
        : config?.responseType === 'json'
          ? 'json'
          : 'text',
      validateStatus: config?.validateStatus
        ? config.validateStatus
        : (s: number) => s < 500,
      signal: config?.signal,
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      data: response.data,
    };
  }
}
