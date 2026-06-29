// ============================================================
// apps/server/src/modules/source-import/parsing/source-format-detector.service.ts
// SourceFormatDetector — 识别 6 种外部书源格式
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ExternalFormatType, FormatDetectionResult } from './types';

@Injectable()
export class PipimiaoFormatDetectorService {
  private readonly logger = new Logger(PipimiaoFormatDetectorService.name);

  detect(content: string, fileName?: string): FormatDetectionResult {
    // 0. ppcat-binary: 文件名匹配
    if (fileName === 'store' || fileName === 'meta') {
      return { format: 'ppcat-binary', confidence: 0.90, reason: `Ppcat binary: ${fileName}`, hasJsExpressions: false, requiresLogin: false, entryCount: 1 };
    }

    // 1. JSON parse
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch (e: any) {
      return { format: 'unknown', confidence: 0, reason: `JSON parse failed: ${e.message?.slice(0, 100)}`, hasJsExpressions: false, requiresLogin: false, entryCount: 0 };
    }
    if (parsed === null || parsed === undefined) {
      return { format: 'unknown', confidence: 0, reason: 'Content is null', hasJsExpressions: false, requiresLogin: false, entryCount: 0 };
    }

    const arr = Array.isArray(parsed) ? (parsed as any[]) : null;
    const obj = arr ? null : (parsed as Record<string, unknown>);

    // 2a. manga-source
    if (obj && this.isMangaSource(obj)) {
      return { format: 'manga-source', confidence: 0.98, reason: 'MangaSource: search/detail/chapters/images + listSelector', hasJsExpressions: this.hasJs(obj), requiresLogin: this.hasLogin(obj), entryCount: 1 };
    }
    // 2b. legado-single
    if (obj && this.isLegado(obj)) {
      return { format: 'legado-single', confidence: 0.95, reason: `Legado: bookSourceName="${(parsed as any).bookSourceName}"`, hasJsExpressions: this.hasJs(obj), requiresLogin: this.hasLogin(obj), entryCount: 1 };
    }
    // 2c. legado-array
    if (arr && arr.length > 0 && this.isLegado(arr[0])) {
      return { format: 'legado-array', confidence: 0.95, reason: `Legado array: ${arr.length} entries`, hasJsExpressions: arr.some((e: any) => this.hasJs(e)), requiresLogin: arr.some((e: any) => this.hasLogin(e)), entryCount: arr.length };
    }
    // 2d. comicfs
    if (obj && this.isComicFS(obj)) {
      return { format: 'comicfs', confidence: 0.95, reason: 'ComicFS: 4 sections without Legado fields', hasJsExpressions: false, requiresLogin: this.hasLogin(obj), entryCount: 1 };
    }
    // 2e. pipimiao-legacy
    if (arr && arr.length > 0 && this.isPipimiaoLegacy(arr[0])) {
      return { format: 'pipimiao-legacy', confidence: 0.85, reason: `Pipimiao legacy: ${arr.length} entries`, hasJsExpressions: false, requiresLogin: false, entryCount: arr.length };
    }
    // 2f. json-array (低置信度 → MANUAL_REVIEW)
    if (arr && arr.length > 0 && this.hasHostField(arr[0])) {
      return { format: 'json-array', confidence: 0.50, reason: `Generic array [${arr.length}]. Keys: ${Object.keys(arr[0] as object).slice(0,8).join(',')}`, hasJsExpressions: false, requiresLogin: false, entryCount: arr.length };
    }
    // 3. unknown
    const keys = arr ? (arr.length > 0 ? Object.keys((arr[0] as object)||{}).slice(0,10).join(',') : 'empty') : Object.keys(obj||{}).slice(0,10).join(',');
    return { format: 'unknown', confidence: 0, reason: `Unknown. Keys: ${keys||'none'}`, hasJsExpressions: false, requiresLogin: false, entryCount: 0 };
  }

  // ========== 格式特征检测 ==========

  private isMangaSource(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    const s = ['search','detail','chapters','images'];
    return s.every(k => o[k] && typeof o[k] === 'object') && s.some(k => typeof o[k].listSelector === 'string' || typeof o[k].item === 'string');
  }

  private isLegado(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    const hasName = typeof o.bookSourceName === 'string' && o.bookSourceName.length > 0;
    const hasUrl = typeof o.bookSourceUrl === 'string' || typeof o.host === 'string';
    if (!hasName || !hasUrl) return false;
    return ['ruleSearch','ruleBookInfo','ruleToc','ruleContent','bookSourceType'].some(f => o[f] !== undefined);
  }

  private isComicFS(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    const s = ['search','detail','chapters','images'];
    if (!s.every(k => o[k] && typeof o[k] === 'object')) return false;
    return !['bookSourceName','bookSourceUrl','ruleSearch','ruleBookInfo','ruleToc','ruleContent'].some(m => o[m] !== undefined);
  }

  private isPipimiaoLegacy(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    return typeof o.host === 'string' && o.host.length > 0 && o.search && typeof o.search === 'object' && o.detail && typeof o.detail === 'object' && !o.bookSourceName && !o.ruleSearch;
  }

  private hasHostField(o: any): boolean {
    return o && (typeof o.host === 'string' && o.host.length > 0 || typeof o.url === 'string' || typeof o.bookSourceUrl === 'string');
  }

  // ========== 辅助检测 ==========

  private hasJs(o: any): boolean {
    const seen = new Set<any>();
    const check = (v: any): boolean => {
      if (v === null || v === undefined || seen.has(v)) return false;
      seen.add(v);
      if (typeof v === 'string') return v.includes('@js:') || v.includes('<js>');
      if (Array.isArray(v)) return v.some(x => check(x));
      if (typeof v === 'object') return Object.values(v).some(x => check(x));
      return false;
    };
    return check(o);
  }

  private hasLogin(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    if (o.needLogin === true || o.requireLogin === true || o.login === true) return true;
    if (['loginUrl','loginCheck','loginAPI'].some(k => typeof o[k] === 'string' && o[k].length > 0)) return true;
    if (typeof o.headers === 'string' && o.headers.toLowerCase().includes('cookie')) return true;
    return false;
  }
}
