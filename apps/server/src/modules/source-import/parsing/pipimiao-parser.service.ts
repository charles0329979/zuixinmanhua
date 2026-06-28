// ============================================================
// apps/server/src/modules/source-import/pipimiao/ppcat-binary-parser.service.ts
// PpcatBinaryParser — 皮皮喵私有二进制书源格式解析器
//
// 输入: store 文件 (Buffer) + meta 文件 (JSON)
// 输出: CanonicalSourceDefinition[] 或空数组 (解析失败)
//
// 皮皮喵 store 文件格式为私有二进制编码，非标准压缩/加密。
// 解析策略:
//   1. 校验 meta 版本兼容性
//   2. 尝试 zlib/raw-deflate/gzip 解压
//   3. 尝试常见 XOR/AES 解密模式
//   4. 成功 → 解析为书源列表
//   5. 失败 → 返回 []，由上层标记 MANUAL_REVIEW
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import * as zlib from 'zlib';
import type { CanonicalSourceDefinition } from '../types';

/** ppcat_store meta 文件结构 */
interface PpcatMeta {
  ruleId: string;
  ruleVersion: number;
  ruleContent: string;
  ruleAuto: boolean;
}

/** 解析诊断信息 */
export interface PpcatParseDiagnostic {
  version: number;
  fileSize: number;
  decompressionAttempted: string[];
  decryptionAttempted: string[];
  error?: string;
}

@Injectable()
export class PpcatBinaryParserService {
  private readonly logger = new Logger(PpcatBinaryParserService.name);

  /** 支持的 meta 版本范围 */
  private readonly MIN_VERSION = 2009000;
  private readonly MAX_VERSION = 9999999;

  /**
   * 解析 store 二进制文件
   *
   * @param storeBuffer  store 文件二进制内容
   * @param meta         meta 文件解析后的 JSON
   * @returns 解析出的书源列表；失败返回空数组
   */
  parse(
    storeBuffer: Buffer,
    meta: PpcatMeta,
  ): { sources: CanonicalSourceDefinition[]; diagnostic: PpcatParseDiagnostic } {
    const diagnostic: PpcatParseDiagnostic = {
      version: meta.ruleVersion || 0,
      fileSize: storeBuffer.length,
      decompressionAttempted: [],
      decryptionAttempted: [],
    };

    // 校验版本
    if (meta.ruleVersion < this.MIN_VERSION || meta.ruleVersion > this.MAX_VERSION) {
      diagnostic.error = `Unsupported meta version: ${meta.ruleVersion}`;
      this.logger.warn(`PpcatBinaryParser: ${diagnostic.error}`);
      return { sources: [], diagnostic };
    }

    let data: Buffer | null = null;

    // Phase 1: 尝试直接解析 (未压缩)
    if (this.looksLikeStructured(storeBuffer)) {
      data = storeBuffer;
      diagnostic.decompressionAttempted.push('raw');
    }

    // Phase 2: 尝试标准解压
    if (!data) {
      data = this.tryDecompress(storeBuffer, diagnostic);
    }

    // Phase 3: 解压成功后解析为 CanonicalSourceDefinition[]
    if (data) {
      const sources = this.parseStructured(data, diagnostic);
      if (sources.length > 0) {
        this.logger.log(
          `PpcatBinaryParser: parsed ${sources.length} sources from store (${storeBuffer.length}B)`,
        );
        return { sources, diagnostic };
      }
    }

    diagnostic.error = 'Unable to parse store file — format not recognized';
    this.logger.warn(`PpcatBinaryParser: ${diagnostic.error}`);
    return { sources: [], diagnostic };
  }

  /**
   * 从 GitHub API 获取的 meta 内容解析
   */
  parseMeta(rawContent: string): PpcatMeta | null {
    try {
      const meta = JSON.parse(rawContent) as PpcatMeta;
      if (typeof meta.ruleVersion !== 'number') return null;
      return meta;
    } catch {
      return null;
    }
  }

  // =================== Private ===================

  /** 检查是否看起来像结构化数据 (JSON/文本) */
  private looksLikeStructured(buf: Buffer): boolean {
    // JSON 通常以 '{' 或 '[' 开头
    const firstByte = buf[0];
    return firstByte === 0x7B || firstByte === 0x5B; // { or [
  }

  /** 尝试各种解压算法 */
  private tryDecompress(buf: Buffer, diag: PpcatParseDiagnostic): Buffer | null {
    // Raw deflate
    try {
      const result = zlib.inflateRawSync(buf);
      if (this.looksLikeStructured(result)) {
        diag.decompressionAttempted.push('inflateRaw');
        return result;
      }
    } catch { /* continue */ }

    // Zlib
    try {
      const result = zlib.inflateSync(buf);
      if (this.looksLikeStructured(result)) {
        diag.decompressionAttempted.push('inflate');
        return result;
      }
    } catch { /* continue */ }

    // Gzip
    try {
      const result = zlib.gunzipSync(buf);
      if (this.looksLikeStructured(result)) {
        diag.decompressionAttempted.push('gunzip');
        return result;
      }
    } catch { /* continue */ }

    // Brotli (if available)
    try {
      const brotli = require('brotli');
      const result = brotli.decompress(buf);
      if (this.looksLikeStructured(Buffer.from(result))) {
        diag.decompressionAttempted.push('brotli');
        return Buffer.from(result);
      }
    } catch { /* brotli not installed */ }

    // Try deflate at offset 0-200 (some formats have header)
    for (let offset = 0; offset < Math.min(200, buf.length); offset++) {
      try {
        const result = zlib.inflateRawSync(buf.slice(offset));
        if (result.length > 500 && this.looksLikeStructured(result)) {
          diag.decompressionAttempted.push(`inflateRaw@${offset}`);
          return result;
        }
      } catch { /* continue */ }
    }

    return null;
  }

  /** 将解压后的数据解析为 CanonicalSourceDefinition[] */
  private parseStructured(
    data: Buffer,
    diag: PpcatParseDiagnostic,
  ): CanonicalSourceDefinition[] {
    try {
      const text = data.toString('utf-8').trim();
      let parsed: any;

      if (text.startsWith('{')) {
        parsed = JSON.parse(text);
      } else if (text.startsWith('[')) {
        parsed = JSON.parse(text);
      } else {
        return [];
      }

      // 标准化为数组
      const entries: any[] = Array.isArray(parsed) ? parsed
        : parsed.sources || parsed.data || parsed.list || parsed.items || [];

      if (!Array.isArray(entries) || entries.length === 0) return [];

      // 转换为 CanonicalSourceDefinition (由 normalizer 完成)
      // 这里只做基本结构提取
      this.logger.debug(
        `PpcatBinaryParser: parsed ${entries.length} raw entries, ` +
        `first key: ${Object.keys(entries[0] || {}).slice(0, 5).join(', ')}`,
      );

      return entries.map((entry: any, idx: number) => ({
        id: entry.id || entry._id || entry.ruleId || `ppcat-${idx}`,
        name: entry.name || entry.bookSourceName || entry.title || `ppcat-${idx}`,
        host: entry.host || entry.bookSourceUrl || entry.url || '',
        language: entry.language || 'zh',
        search: this.extractRule(entry, 'search', ['ruleSearch', 'search']),
        detail: this.extractRule(entry, 'detail', ['ruleBookInfo', 'detail']),
        chapters: this.extractRule(entry, 'chapters', ['ruleToc', 'toc', 'chapters']),
        images: this.extractRule(entry, 'images', ['ruleContent', 'content', 'images']),
        capabilities: {
          search: !!entry.ruleSearch || !!entry.search,
          detail: !!entry.ruleBookInfo || !!entry.detail,
          chapters: !!entry.ruleToc || !!entry.toc || !!entry.chapters,
          images: !!entry.ruleContent || !!entry.content || !!entry.images,
          requiresJs: false,
          requiresLogin: false,
          requiresManualAdapter: false,
        },
        rawRules: entry,
        fieldMappings: [],
        unmappedFields: [],
        warnings: [],
      }));
    } catch (e: any) {
      this.logger.warn(`PpcatBinaryParser: parseStructured failed: ${e.message}`);
      return [];
    }
  }

  private extractRule(
    entry: any,
    section: string,
    keys: string[],
  ): any {
    for (const key of keys) {
      if (entry[key]) return entry[key];
    }
    return entry[section] || {};
  }
}
