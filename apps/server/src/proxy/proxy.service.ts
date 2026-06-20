import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SourceConfigService } from '../sources/config/source-config.service';

// ============================================================
// ProxyService — 图片代理 (防盗链绕过 + Content-Type 检测)
//
// Bug 修复记录:
// Bug1: getRefererForSource try/catch new URL() 避免 500 崩溃
// Bug2: refererBase 参数优先 → refererMap → 图片 URL origin
// Bug3: magic bytes 检测真实图片格式 (JPEG/PNG/GIF/WebP/AVIF)
// Bug4: 删除 string 死代码, 防御性 Buffer/ArrayBuffer 判断
// Bug5: 结构化错误响应 (403/404/504/502)
// ============================================================

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  /** 硬编码书源的 Referer 映射 */
  private readonly refererMap: Record<string, string> = {
    baozi: 'https://www.baozimh.com/',
    kanman: 'https://www.kanman.com/',
    manwa: 'https://manwafz.cc/',
    yeman: 'https://www.yemancomic.com/',
    copy: 'https://www.mangacopy.com/',
    dongmanzhijia: 'https://www.dmzj.com/',
  };

  constructor(private readonly configService: SourceConfigService) {}

  // ============================================================
  // Bug 1 fix: getRefererForSource — 安全获取 Referer
  // 不会因为非法 source 参数而崩溃
  // ============================================================

  /**
   * 根据 sourceId 获取合适的 Referer
   * 查找优先级: refererMap → 数据库 config domins → 返回 ''
   * 注意: sourceId 可能不是合法 URL，严禁直接 new URL(sourceId)
   */
  private getRefererForSource(sourceId: string): string {
    // 1. 硬编码映射表
    if (this.refererMap[sourceId]) {
      return this.refererMap[sourceId];
    }

    // 2. 数据库中的书源配置 (可能包含 domain)
    try {
      const config = this.configService.getConfig(sourceId);
      if (config?.domains?.[0]?.url) {
        return config.domains[0].url;
      }
    } catch {
      // 规则源可能不在 DB 中，忽略
    }

    // 3. sourceId 本身是合法 URL 的情况 (极少，但防御)
    try {
      const parsed = new URL(sourceId);
      return `${parsed.protocol}//${parsed.hostname}/`;
    } catch {
      // sourceId 不是 URL，这是正常的 (规则源 ID 如 "yydsmh")
    }

    return '';
  }

  // ============================================================
  // Bug 2 fix: buildRequestHeaders — 支持 refererBase 参数
  // 优先级: refererBase → refererMap/DB → 图片URL origin
  // ============================================================

  /**
   * 构造代理请求头，包含 UA + Referer
   * @param sourceId   书源 ID (可选)
   * @param refererBase 调用方指定的 Referer 基础域名 (可选, 最高优先)
   * @param imageUrl   图片原始 URL (用于 fallback)
   */
  private buildRequestHeaders(
    sourceId: string,
    refererBase: string | undefined,
    imageUrl: string,
  ): { 'User-Agent': string; Referer: string } {
    // UA: 优先从 DB config 取，否则用移动端 UA (更不容易被拦截)
    let userAgent = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';
    try {
      const config = this.configService.getConfig(sourceId);
      if (config?.requestConfig?.userAgent) {
        userAgent = config.requestConfig.userAgent;
      }
    } catch {
      // ignore
    }

    // --- Referer 构造 (Bug 2 核心修复) ---

    // 优先级 1: 调用方显式传入的 refererBase
    if (refererBase && refererBase.trim()) {
      return {
        'User-Agent': userAgent,
        Referer: refererBase.endsWith('/') ? refererBase : refererBase + '/',
      };
    }

    // 优先级 2: sourceId 映射 (硬编码 + DB)
    const sourceReferer = this.getRefererForSource(sourceId);
    if (sourceReferer) {
      return {
        'User-Agent': userAgent,
        Referer: sourceReferer.endsWith('/') ? sourceReferer : sourceReferer + '/',
      };
    }

    // 优先级 3: 从图片 URL 本身提取 origin
    try {
      const imgUrl = new URL(imageUrl);
      return {
        'User-Agent': userAgent,
        Referer: `${imgUrl.protocol}//${imgUrl.hostname}/`,
      };
    } catch {
      // 图片 URL 也解析不了，放弃 Referer
    }

    return {
      'User-Agent': userAgent,
      Referer: '',
    };
  }

  // ============================================================
  // Bug 3 fix: detectContentType — magic bytes 格式检测
  // 优先级: 响应头 → URL后缀 → magic bytes → 默认 image/jpeg
  // ============================================================

  /**
   * 检测图片的真实 Content-Type
   * @param responseCt  上游响应头 Content-Type
   * @param url         图片 URL
   * @param buffer      图片数据 buffer (用于 magic bytes 检测)
   */
  private detectContentType(
    responseCt: string | undefined,
    url: string,
    buffer: Buffer,
  ): string {
    const ct = String(responseCt || '');

    // 如果上游已经返回了有效的 image/* 类型，直接使用
    if (ct && ct.indexOf('image/') === 0 && ct !== 'image/unknown') {
      return ct;
    }

    // 从 URL 扩展名推测
    const urlLower = (url || '').toLowerCase();
    if (urlLower.indexOf('.webp') !== -1) return 'image/webp';
    if (urlLower.indexOf('.png') !== -1) return 'image/png';
    if (urlLower.indexOf('.gif') !== -1) return 'image/gif';
    if (urlLower.indexOf('.avif') !== -1) return 'image/avif';
    // jpg/jpeg 作为最低优先级 URL 检测 (太常见容易误判)
    if (urlLower.indexOf('.jpeg') !== -1 || urlLower.indexOf('.jpg') !== -1) return 'image/jpeg';

    // --- Bug 3 核心修复: magic bytes 检测 ---
    // 读取前 12 字节判断真实文件格式
    if (buffer && buffer.length >= 12) {
      // JPEG: FF D8 FF
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
      }
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4e && buffer[3] === 0x47
      ) {
        return 'image/png';
      }
      // GIF: 47 49 46 38 (GIF8)
      if (
        buffer[0] === 0x47 && buffer[1] === 0x49 &&
        buffer[2] === 0x46 && buffer[3] === 0x38
      ) {
        return 'image/gif';
      }
      // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
      if (
        buffer[0] === 0x52 && buffer[1] === 0x49 &&
        buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length >= 12 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 &&
        buffer[10] === 0x42 && buffer[11] === 0x50
      ) {
        return 'image/webp';
      }
      // AVIF: 00 00 00 .. 66 74 79 70 61 76 69 66 (....ftypavif)
      // ftyp box at offset 4, then 'avif' at offset 8
      if (
        buffer.length >= 12 &&
        buffer[4] === 0x66 && buffer[5] === 0x74 &&
        buffer[6] === 0x79 && buffer[7] === 0x70 &&
        buffer[8] === 0x61 && buffer[9] === 0x76 &&
        buffer[10] === 0x69 && buffer[11] === 0x66
      ) {
        return 'image/avif';
      }
    }

    // 所有检测都失败，默认 fallback
    return 'image/jpeg';
  }

  // ============================================================
  // 主方法: proxyImage
  // ============================================================

  async proxyImage(
    url: string,
    sourceId: string,
    refererBase: string | undefined,
    res: any,
  ): Promise<void> {
    if (!url) {
      res.status(400).json({ error: 'PROXY_FAILED', reason: 'missing_url' });
      return;
    }

    if (!this.isAllowedDomain(url, sourceId)) {
      res.status(403).json({ error: 'PROXY_FAILED', reason: 'domain_blocked', url });
      return;
    }

    const headers = this.buildRequestHeaders(sourceId, refererBase, url);

    let axiosResponse: any;
    try {
      axiosResponse = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers,
      });
    } catch (e: any) {
      // --- Bug 5 fix: 结构化错误响应 ---
      const statusCode = e.response?.status;
      let reason: string;
      let httpStatus: number;

      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || e.message?.includes('timeout')) {
        reason = 'timeout';
        httpStatus = 504;
      } else if (statusCode === 403 || statusCode === 401) {
        reason = 'upstream_403';
        httpStatus = 403;
      } else if (statusCode === 404) {
        reason = 'not_found';
        httpStatus = 404;
      } else if (statusCode) {
        reason = `upstream_${statusCode}`;
        httpStatus = 502;
      } else if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
        reason = 'dns_or_connect';
        httpStatus = 502;
      } else {
        reason = 'unknown';
        httpStatus = 502;
      }

      this.logger.warn(
        `[PROXY_FAILED] source=${sourceId || '-'} reason=${reason} url=${url?.slice(0, 120)} status=${statusCode || '-'} err=${e.message?.slice(0, 100)}`,
      );

      if (!res.headersSent) {
        res.status(httpStatus).json({
          error: 'PROXY_FAILED',
          reason,
          url: url?.slice(0, 200),
          sourceId: sourceId || undefined,
        });
      }
      return;
    }

    // --- Bug 4 fix: 防御性 Buffer 处理，删除死代码 string 分支 ---

    let buffer: Buffer;
    if (Buffer.isBuffer(axiosResponse.data)) {
      buffer = axiosResponse.data;
    } else if (axiosResponse.data instanceof ArrayBuffer) {
      buffer = Buffer.from(axiosResponse.data);
    } else {
      this.logger.error(
        `[PROXY] Unexpected response data type: ${typeof axiosResponse.data} for ${url?.slice(0, 100)}`,
      );
      if (!res.headersSent) {
        res.status(502).json({
          error: 'PROXY_FAILED',
          reason: 'unexpected_data_type',
          dataType: typeof axiosResponse.data,
        });
      }
      return;
    }

    // --- Bug 3 fix: magic bytes 检测 ---

    const contentType = this.detectContentType(
      axiosResponse.headers['content-type'],
      url,
      buffer,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.send(buffer);
  }

  private isAllowedDomain(_url: string, _sourceId: string): boolean {
    return true;
  }
}
