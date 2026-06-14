// ============================================================
// packages/network/src/http-client.ts
// 平台无关的 HTTP 客户端接口
// ============================================================

/** HTTP 请求配置 */
export interface HttpRequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
  responseType?: 'text' | 'json' | 'stream' | 'arraybuffer';
  signal?: AbortSignal;
  /** 最大重定向次数 (仅 axios 策略使用) */
  maxRedirects?: number;
  /** 自定义状态码验证 */
  validateStatus?: (status: number) => boolean;
}

/** HTTP 响应 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: string | Record<string, unknown> | ArrayBuffer | unknown;
}

/** ★ 平台无关的 HTTP 客户端接口 ★ */
export interface IHttpClient {
  get(url: string, config?: HttpRequestConfig): Promise<HttpResponse>;
  post(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse>;
  head(url: string, config?: HttpRequestConfig): Promise<HttpResponse>;
}
