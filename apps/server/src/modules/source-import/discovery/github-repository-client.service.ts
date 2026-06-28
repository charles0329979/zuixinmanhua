// ============================================================
// apps/server/src/modules/source-import/discovery/github-repository-client.service.ts
// GitHub Raw / API 拉取客户端
//
// 安全约束:
//   1. 单文件最大 5MB (MAX_FILE_SIZE)
//   2. 总大小上限 50MB (MAX_TOTAL_SIZE)
//   3. 请求超时默认 30s
//   4. 不允许执行远程仓库中的任何代码
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

/** 单文件最大体积 (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
/** 单次同步总大小上限 (50MB) */
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
/** 请求超时默认值 (30s) */
const DEFAULT_TIMEOUT_MS = 30000;
/** 最大重定向次数 */
const MAX_REDIRECTS = 5;
/** GitHub API 响应体上限 (100KB，commit JSON) */
const API_MAX_CONTENT_LENGTH = 102400;
/** 目录列表响应体上限 (512KB) */
const DIR_LIST_MAX_CONTENT_LENGTH = 512000;

export interface FetchResult {
  body: string;
  statusCode: number;
  contentType: string;
  contentLength: number;
  finalUrl: string;
  etag?: string;
}

export interface FetchRawResult {
  buffer: Buffer;
  statusCode: number;
  contentType: string;
  contentLength: number;
  finalUrl: string;
  etag?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxContentLength?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  githubToken?: string;
}

@Injectable()
export class RepositoryClientService {
  private readonly logger = new Logger(RepositoryClientService.name);

  // ============================================================
  // 公开 API
  // ============================================================

  /** 拉取文本内容 (JSON/HTML/文本) */
  async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    const opts = this.resolveOptions(options);
    return this.fetchWithRedirect(url, opts, 0, false);
  }

  /** 拉取二进制内容 (ppcat store 等) */
  async fetchRaw(url: string, options?: FetchOptions): Promise<FetchRawResult> {
    const opts = this.resolveOptions(options);
    const result = await this.fetchWithRedirect(url, opts, 0, true);
    return {
      buffer: Buffer.from(result.body, 'binary'),
      statusCode: result.statusCode,
      contentType: result.contentType,
      contentLength: result.contentLength,
      finalUrl: result.finalUrl,
      etag: result.etag,
    };
  }

  /** 获取 GitHub 仓库最新 commit SHA */
  async getCommitSha(repoUrl: string, branch: string): Promise<string | null> {
    try {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
      if (!match) return null;

      const [, owner, repo] = match;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

      const result = await this.fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'zuixinmanhua-source-import/1.0',
        },
        timeoutMs: 15000,
        maxContentLength: API_MAX_CONTENT_LENGTH,
      });

      if (result.statusCode === 200) {
        const data = JSON.parse(result.body);
        return data.sha || null;
      }
      return null;
    } catch (e: any) {
      this.logger.warn(`Failed to get commit SHA for ${repoUrl}: ${e.message}`);
      return null;
    }
  }

  /**
   * 列出仓库目录中的源文件
   *
   * @param repoUrl   GitHub 仓库 URL
   * @param branch    分支名
   * @param path      仓库内子目录路径
   * @param extensions 允许的文件扩展名列表 (默认 ['.json', '.txt'])
   */
  async listRepoFiles(
    repoUrl: string,
    branch: string,
    path: string = '',
    extensions: string[] = ['.json', '.txt'],
  ): Promise<{ name: string; path: string; sha: string; downloadUrl: string }[]> {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (!match) return [];

    const [, owner, repo] = match;
    const apiPath = path ? `/${path}` : '';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents${apiPath}?ref=${branch}`;

    const result = await this.fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'zuixinmanhua-source-import/1.0',
      },
      timeoutMs: 20000,
      maxContentLength: DIR_LIST_MAX_CONTENT_LENGTH,
    });

    if (result.statusCode !== 200) return [];

    try {
      const data = JSON.parse(result.body);

      // Single file response (GitHub API returns object for file, array for dir)
      if (!Array.isArray(data) && data.type === 'file' && data.download_url) {
        if (this.matchesExtension(data.name, extensions)) {
          return [{ name: data.name, path: data.path, sha: data.sha, downloadUrl: data.download_url }];
        }
        return [];
      }

      if (!Array.isArray(data)) return [];

      return data
        .filter((f: any) => f.type === 'file' && this.matchesExtension(f.name, extensions))
        .map((f: any) => ({
          name: f.name, path: f.path, sha: f.sha, downloadUrl: f.download_url,
        }));
    } catch {
      return [];
    }
  }

  // ============================================================
  // Private
  // ============================================================

  private resolveOptions(options?: FetchOptions) {
    return {
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxContentLength: options?.maxContentLength ?? MAX_FILE_SIZE,
      maxRedirects: options?.maxRedirects ?? MAX_REDIRECTS,
      headers: options?.headers ?? {},
      githubToken: options?.githubToken ?? '',
    };
  }

  private matchesExtension(name: string, extensions: string[]): boolean {
    // Empty string means "match any file" (no extension filter)
    if (extensions.includes('')) return true;
    // Exact match (e.g. "store", "meta" without dot)
    if (extensions.includes(name)) return true;
    // Extension match (e.g. ".json", ".txt")
    return extensions.some(ext => ext.startsWith('.') && name.endsWith(ext));
  }

  /** 核心 HTTP 请求 (带重定向跟随、体积限制、超时) */
  private fetchWithRedirect(
    url: string,
    opts: ReturnType<typeof RepositoryClientService.prototype.resolveOptions>,
    redirectCount: number,
    raw: boolean, // true = accept binary, return raw bytes as latin1 string
  ): Promise<FetchResult> {
    return new Promise((resolve, reject) => {
      if (redirectCount > opts.maxRedirects) {
        return reject(new Error(`Too many redirects: ${redirectCount}`));
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return reject(new Error(`Invalid URL: ${url}`));
      }

      const client = parsed.protocol === 'https:' ? https : http;

      const req = client.request(
        url,
        {
          method: 'GET',
          timeout: opts.timeoutMs,
          headers: {
            'User-Agent': 'zuixinmanhua-source-import/1.0',
            'Accept': raw ? '*/*' : 'application/json, text/plain, */*',
            ...opts.headers,
          },
          rejectUnauthorized: true,
        },
        (res) => {
          // Handle redirect
          if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
            res.resume();
            const redirectUrl = new URL(res.headers.location, url).toString();
            return this.fetchWithRedirect(redirectUrl, opts, redirectCount + 1, raw)
              .then(resolve).catch(reject);
          }

          const chunks: Buffer[] = [];
          let totalLength = 0;

          res.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > opts.maxContentLength) {
              req.destroy();
              return reject(
                new Error(`File too large: ${totalLength} bytes (max ${opts.maxContentLength / 1024 / 1024}MB)`),
              );
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            const ct = (res.headers['content-type'] || '').toLowerCase();

            // Binary content check — reject unless raw mode
            if (!raw && (
              ct.includes('application/octet-stream') ||
              ct.includes('application/zip') ||
              ct.includes('image/')
            )) {
              return reject(new Error(`Binary content type not allowed in text mode: ${ct}`));
            }

            const buffer = Buffer.concat(chunks);
            const body = raw
              ? buffer.toString('binary') // preserve raw bytes
              : buffer.toString('utf-8');

            resolve({
              body,
              statusCode: res.statusCode || 0,
              contentType: ct,
              contentLength: totalLength,
              finalUrl: url,
              etag: res.headers.etag as string | undefined,
            });
          });

          res.on('error', reject);
        },
      );

      req.on('error', (e: any) => {
        reject(new Error(`HTTP request failed: ${e.code || e.message}`));
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${opts.timeoutMs}ms`));
      });
      req.end();
    });
  }
}
