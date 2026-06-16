// ============================================================
// apps/server/src/http/h2-http-client.ts
// ★ HTTP/2 客户端 — 对 yemancomic.com 使用 Node.js http2 绕过 TLS 指纹检测
// 其他域名委托给 AxiosHttpClient (标准 HTTP/1.1)
// ============================================================

import * as http2 from 'http2';
import * as zlib from 'zlib';
import type { IHttpClient, HttpRequestConfig, HttpResponse } from '@zuixinmanhua/network';
import { AxiosHttpClient } from '@zuixinmanhua/network';
import { CircuitBreakerError } from '@zuixinmanhua/types';

// iOS Safari UA — 绕过 KIMICMS CDN 的桌面浏览器检测
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** 需要走 HTTP/2 的域名列表 */
const H2_DOMAINS = ['www.yemancomic.com', 'yemancomic.com'];

/**
 * H2HttpClient — 对特定域名使用 HTTP/2，其他域名使用标准 HTTP/1.1
 * 实现 IHttpClient 接口，可注入到 source-core 的适配器中使用
 */
export class H2HttpClient implements IHttpClient {
  private http1: AxiosHttpClient;

  constructor() {
    this.http1 = new AxiosHttpClient();
  }

  // ========== IHttpClient 实现 ==========

  async get(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    if (this.shouldUseH2(url)) {
      return this.h2Get(url, config);
    }
    return this.http1.get(url, config);
  }

  async post(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse> {
    if (this.shouldUseH2(url)) {
      return this.h2Post(url, data, config);
    }
    return this.http1.post(url, data, config);
  }

  async head(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    // HEAD 请求走 HTTP/1.1 即可（仅用于健康检查）
    return this.http1.head(url, config);
  }

  // ========== 域名判断 ==========

  private shouldUseH2(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return H2_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  // ========== HTTP/2 GET ==========

  private h2Get(url: string, config?: HttpRequestConfig): Promise<HttpResponse> {
    const { hostname, pathname, search } = new URL(url);
    const path = pathname + search;

    return new Promise((resolve, reject) => {
      const client = http2.connect(`https://${hostname}`);
      client.on('error', (err) => reject(err));

      const headers: Record<string, string> = {
        ':path': path,
        ':method': 'GET',
        ':authority': hostname,
        ':scheme': 'https',
        'user-agent': IOS_SAFARI_UA,
        'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh-Hans;q=0.9',
        ...(config?.headers || {}),
      };

      const req = client.request(headers);
      const chunks: Buffer[] = [];
      let contentEncoding = '';
      let responseHeaders: Record<string, string> = {};

      req.on('response', (h) => {
        contentEncoding = h['content-encoding'] || '';
        // Flatten headers
        for (const [k, v] of Object.entries(h)) {
          if (k.startsWith(':') || k === 'content-encoding') continue;
          responseHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
      });

      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        client.close();
        const buffer = Buffer.concat(chunks);
        let text = this.decompress(buffer, contentEncoding);

        // 反爬检测
        const blockErr = this.detectAntiBot(text);
        if (blockErr) {
          reject(new CircuitBreakerError(blockErr, 'yeman', 'redirect'));
          return;
        }

        resolve({
          status: 200,
          statusText: 'OK',
          headers: responseHeaders,
          data: text,
        });
      });
      req.on('error', (err) => {
        client.close();
        reject(err);
      });
      req.setTimeout(config?.timeout || 15000, () => {
        client.close();
        reject(new Error(`HTTP/2 request timeout after ${config?.timeout || 15000}ms: ${url}`));
      });
      req.end();
    });
  }

  // ========== HTTP/2 POST ==========

  private h2Post(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse> {
    const { hostname, pathname, search } = new URL(url);
    const path = pathname + search;
    const bodyStr = typeof data === 'string' ? data : JSON.stringify(data || {});

    return new Promise((resolve, reject) => {
      const client = http2.connect(`https://${hostname}`);
      client.on('error', (err) => reject(err));

      const headers: Record<string, string> = {
        ':path': path,
        ':method': 'POST',
        ':authority': hostname,
        ':scheme': 'https',
        'user-agent': IOS_SAFARI_UA,
        'accept': 'application/json, text/html, */*',
        'accept-language': 'zh-CN,zh-Hans;q=0.9',
        'content-length': String(Buffer.byteLength(bodyStr)),
        ...(config?.headers || {}),
      };

      const req = client.request(headers);
      const chunks: Buffer[] = [];
      let contentEncoding = '';
      let cookies = '';
      let responseHeaders: Record<string, string> = {};

      req.on('response', (h) => {
        contentEncoding = h['content-encoding'] || '';
        const sc = h['set-cookie'];
        if (sc) {
          cookies = (Array.isArray(sc) ? sc : [sc])
            .map((c) => c.split(';')[0]!.trim())
            .join('; ');
        }
        for (const [k, v] of Object.entries(h)) {
          if (k.startsWith(':') || k === 'content-encoding') continue;
          responseHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
        if (cookies) responseHeaders['set-cookie'] = cookies;
      });

      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        client.close();
        const buffer = Buffer.concat(chunks);
        const text = this.decompress(buffer, contentEncoding);

        resolve({
          status: 200,
          statusText: 'OK',
          headers: responseHeaders,
          data: text,
        });
      });
      req.on('error', (err) => {
        client.close();
        reject(err);
      });
      req.setTimeout(config?.timeout || 15000, () => {
        client.close();
        reject(new Error(`HTTP/2 POST timeout after ${config?.timeout || 15000}ms: ${url}`));
      });
      req.write(bodyStr);
      req.end();
    });
  }

  // ========== Helpers ==========

  private decompress(buffer: Buffer, contentEncoding: string): string {
    try {
      if (contentEncoding === 'gzip' || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
        return zlib.gunzipSync(buffer).toString('utf-8');
      }
      if (contentEncoding === 'br') {
        return zlib.brotliDecompressSync(buffer).toString('utf-8');
      }
      return buffer.toString('utf-8');
    } catch {
      return buffer.toString('utf-8');
    }
  }

  private detectAntiBot(html: string): string | null {
    const isBaiduRedirect =
      html.includes('百度一下') ||
      (html.includes('location.replace') && html.includes('baidu.com')) ||
      (html.includes('http://www.baidu.com/') && html.length < 5000);
    if (isBaiduRedirect) {
      return '检测到重定向至百度，疑似反爬拦截';
    }

    // KIMICMS 验证码检测
    if (html.includes('验证码') && html.includes('checkcode')) {
      return '检测到验证码页面，触发了反爬保护';
    }

    return null;
  }
}

/** 检查 URL 是否属于需要 HTTP/2 的域名 */
export function needsHttp2(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return H2_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

export { H2_DOMAINS };
