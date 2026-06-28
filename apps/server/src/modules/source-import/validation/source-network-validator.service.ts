// ============================================================
// apps/server/src/modules/source-import/validation/source-network-validator.service.ts
// Layer 1: 网络可达性验证 — DNS → TCP → SSL → HTTP HEAD
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { NetworkCheckDetail } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import * as https from 'https';
import * as http from 'http';
import * as dns from 'dns';
import * as net from 'net';
import { URL } from 'url';
import { detectBlockPattern } from '../../../sources/source-policy.types';

@Injectable()
export class SourceNetworkValidatorService {
  private readonly logger = new Logger(SourceNetworkValidatorService.name);

  /**
   * Layer 1 网络验证
   *
   * @returns { passed: boolean, detail: NetworkCheckDetail }
   */
  async validate(source: MangaSource): Promise<{ passed: boolean; detail: NetworkCheckDetail }> {
    const startTime = Date.now();
    const detail: NetworkCheckDetail = {
      dnsResolved: false,
      dnsMs: 0,
      tcpConnected: false,
      tcpMs: 0,
      sslOk: false,
      sslMs: 0,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      redirectCount: 0,
      blockedDetected: false,
      totalMs: 0,
    };

    try {
      // Parse URL
      let url: URL;
      try {
        url = new URL(source.host.startsWith('http') ? source.host : `https://${source.host}`);
      } catch {
        detail.totalMs = Date.now() - startTime;
        return { passed: false, detail };
      }

      const hostname = url.hostname;
      const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);

      // Step 1: DNS (try IPv4 first, then IPv6)
      const dnsStart = Date.now();
      try {
        await dns.promises.resolve4(hostname);
        detail.dnsResolved = true;
      } catch {
        // IPv4 failed, try IPv6
        try {
          await dns.promises.resolve6(hostname);
          detail.dnsResolved = true;
        } catch (e6: any) {
          detail.dnsMs = Date.now() - dnsStart;
          detail.totalMs = Date.now() - startTime;
          return { passed: false, detail };
        }
      }
      detail.dnsMs = Date.now() - dnsStart;

      // Step 2: TCP
      const tcpStart = Date.now();
      detail.tcpConnected = await this.tcpConnect(hostname, port, 5000);
      detail.tcpMs = Date.now() - tcpStart;
      if (!detail.tcpConnected) {
        detail.totalMs = Date.now() - startTime;
        return { passed: false, detail };
      }

      // Step 3: HTTP HEAD (with SSL)
      const sslStart = Date.now();
      const headResult = await this.httpHead(url.toString(), 10000);
      detail.sslMs = Date.now() - sslStart;
      detail.httpStatus = headResult.status;
      detail.contentType = headResult.contentType || null;
      detail.contentLength = headResult.contentLength || null;
      detail.redirectCount = headResult.redirectCount || 0;

      // Check if response indicates blocking
      if (headResult.body) {
        const blockResult = detectBlockPattern(headResult.body);
        detail.blockedDetected = !!blockResult;
        if (detail.blockedDetected) {
          detail.blockReason = blockResult?.message || 'Anti-bot pattern detected in response';
        }
      }

      // Layer 1 passes if we got a response (even 403 — that's Layer 2's concern)
      const isSuccess = headResult.status !== null &&
                        headResult.status > 0 &&
                        !headResult.error?.includes('ENOTFOUND') &&
                        !headResult.error?.includes('ECONNREFUSED') &&
                        !headResult.error?.includes('ETIMEDOUT');

      detail.totalMs = Date.now() - startTime;
      return { passed: isSuccess, detail };

    } catch (e: any) {
      detail.totalMs = Date.now() - startTime;
      return { passed: false, detail };
    }
  }

  private tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
  }

  private httpHead(
    url: string,
    timeoutMs: number,
  ): Promise<{
    status: number | null; contentType?: string; contentLength?: number;
    body?: string; redirectCount?: number; error?: string;
  }> {
    return new Promise(resolve => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;

      const doRequest = (reqUrl: string, redirects: number) => {
        const req = client.request(reqUrl, {
          method: 'GET', // Use GET to capture body for blocking detection
          timeout: timeoutMs,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/json,*/*',
          },
          rejectUnauthorized: false,
        }, (res) => {
          // Handle redirect
          if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location && redirects < 5) {
            res.resume();
            const nextUrl = new URL(res.headers.location, reqUrl).toString();
            return doRequest(nextUrl, redirects + 1);
          }

          const chunks: Buffer[] = [];
          let totalLen = 0;
          res.on('data', (c: Buffer) => {
            totalLen += c.length;
            if (totalLen <= 65536) chunks.push(c); // 64KB max for body scan
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode || null,
              contentType: res.headers['content-type'] as string,
              contentLength: parseInt(res.headers['content-length'] as string || '0') || undefined,
              body: Buffer.concat(chunks).toString('utf-8').slice(0, 32768),
              redirectCount: redirects,
            });
          });
        });

        req.on('error', (e: any) => resolve({
          status: null, error: e.code || e.message,
        }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ status: null, error: 'ETIMEDOUT' });
        });
        req.end();
      };

      doRequest(url, 0);
    });
  }
}
