// ============================================================
// apps/server/src/modules/source-import/parsing/canonical-source-normalizer.service.ts
// CanonicalSourceNormalizer — 所有外部格式 → CanonicalSourceDefinition
//
// 核心原则:
//   - 缺少关键字段 → 标记 capabilities + 写入 warning (不崩溃)
//   - 不猜测字段、不伪造 selector、不自动补全不存在的规则
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type {
  CanonicalSourceDefinition,
  CanonicalRuleSection,
  FieldMapping,
  UnmappedField,
  SourceCapabilities,
  SourceOrigin,
  ExternalFormatType,
} from './types';
import * as crypto from 'crypto';

/** 空规则段 — 用于缺少的规则 */
function emptySection(): CanonicalRuleSection {
  return { url: '', method: 'GET', responseType: 'html', listSelector: '', itemSelectors: {} };
}

/** 空能力标记 */
function emptyCapabilities(): SourceCapabilities {
  return { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: false };
}

@Injectable()
export class PipimiaoNormalizerService {
  private readonly logger = new Logger(PipimiaoNormalizerService.name);

  /**
   * 将检测到的外部格式标准化为 CanonicalSourceDefinition[]
   *
   * @param parsed     解析后的 JSON
   * @param format     检测到的格式类型
   * @param rawContent 原始 JSON 字符串 (保留)
   */
  normalize(parsed: unknown, format: ExternalFormatType, rawContent: string): CanonicalSourceDefinition[] {
    switch (format) {
      case 'legado-array':    return (parsed as any[]).map(item => this.normalizeLegado(item));
      case 'legado-single':   return [this.normalizeLegado(parsed as object)];
      case 'comicfs':         return [this.normalizeComicFS(parsed as any)];
      case 'pipimiao-legacy': return (parsed as any[]).map(item => this.normalizePipimiaoLegacy(item));
      case 'manga-source':    return [this.normalizeMangaSource(parsed as any)];
      case 'json-array':      return (parsed as any[]).map(item => this.normalizeJsonArrayEntry(item));
      default:                return [];
    }
  }

  // ============================================================
  // Legado (阅读3.0) → Canonical
  // ============================================================

  private normalizeLegado(raw: any): CanonicalSourceDefinition {
    const warnings: string[] = [];
    const mappings: FieldMapping[] = [];
    const unmapped: UnmappedField[] = [];

    const host = this.normalizeHost(raw.bookSourceUrl || raw.host || '');
    const name = (raw.bookSourceName || raw.name || 'Unknown').slice(0, 80);
    const id = this.generateId(host, name);
    const homepage = host || undefined;

    // 四个规则段
    const searchSection  = this.mapLegadoSection(raw, 'search',  raw.searchUrl,             raw.ruleSearch,    warnings, mappings, unmapped);
    const detailSection  = this.mapLegadoSection(raw, 'detail',  raw.bookInfoUrl || raw.bookUrlPattern, raw.ruleBookInfo, warnings, mappings, unmapped);
    const chapterSection = this.mapLegadoSection(raw, 'chapters',raw.tocUrl || raw.chapterUrl,         raw.ruleToc,      warnings, mappings, unmapped);
    const imageSection   = this.mapLegadoSection(raw, 'images',  raw.contentUrl || raw.chapterContentUrl, raw.ruleContent, warnings, mappings, unmapped);

    const capabilities = this.detectLegadoCapabilities(raw, searchSection, detailSection, chapterSection, imageSection, warnings);

    // 如果四个段全部为空 → 额外警告
    if (!capabilities.search && !capabilities.detail && !capabilities.chapters && !capabilities.images) {
      warnings.push('No search/detail/chapters/images rules detected — source may be incomplete');
    }

    return {
      id, name, host, homepage,
      version: '1.0.0',
      type: 'rule',
      language: raw.language || 'zh',
      search: searchSection,
      detail: detailSection,
      chapters: chapterSection,
      images: imageSection,
      headers: this.normalizeHeaders(raw.header || raw.headers),
      timeoutMs: raw.respondTime ? Math.min(raw.respondTime, 15000) : undefined,
      raw: raw,
      rawRules: raw,
      fieldMappings: mappings,
      unmappedFields: unmapped,
      warnings,
      capabilities,
    };
  }

  private mapLegadoSection(
    raw: any, section: string, url: string | undefined, rule: any,
    warnings: string[], mappings: FieldMapping[], unmapped: UnmappedField[],
  ): CanonicalRuleSection {
    // 没有规则 → 返回空段 + warning
    if (!rule || typeof rule !== 'object') {
      warnings.push(`${section}: no rule provided — mark capability=false`);
      return emptySection();
    }

    const isJsonApi = !!(url?.includes('{{key}}') && !url?.includes('{{page}}'));
    const section_: CanonicalRuleSection = {
      url: url || '',
      method: raw.searchMethod || 'GET',
      responseType: isJsonApi ? 'json' : 'html',
      listSelector: '',
      itemSelectors: {},
    };

    // Legado → Canonical 字段映射
    const fieldMap: Record<string, string> = {
      bookList: 'listSelector', name: 'title', coverUrl: 'cover',
      bookUrl: 'url', author: 'author', lastChapter: 'latest', intro: 'description',
      chapterList: 'listSelector', chapterName: 'title', chapterUrl: 'url',
      content: 'listSelector',
    };

    for (const [legadoField, canonicalField] of Object.entries(fieldMap)) {
      const value = rule[legadoField];
      if (value === undefined || value === null || value === '') continue;

      if (typeof value === 'string') {
        const translated = this.translateLegadoCss(value);
        if (canonicalField === 'listSelector') {
          section_.listSelector = section_.listSelector || translated;
        } else {
          section_.itemSelectors[canonicalField] = translated;
        }
        mappings.push({ rawPath: `rule.${legadoField}`, canonicalField: `${section}.${canonicalField}`, method: 'direct', confidence: 1.0 });
      } else {
        unmapped.push({ rawPath: `rule.${legadoField}`, rawValue: value, reason: `Non-string value type: ${typeof value}` });
      }
    }

    // 检测 @js:
    const hasJs = Object.values(rule).some(
      v => typeof v === 'string' && (v.includes('@js:') || v.includes('<js>')),
    );
    if (hasJs) warnings.push(`${section}: contains @js: expressions — requires QuickJS runtime`);

    return section_;
  }

  // ============================================================
  // ComicFS → Canonical
  // ============================================================

  private normalizeComicFS(raw: any): CanonicalSourceDefinition {
    const warnings: string[] = [];
    const mappings: FieldMapping[] = [];
    const unmapped: UnmappedField[] = [];

    const host = this.normalizeHost(raw.host || '');
    const name = (raw.name || 'Unknown').slice(0, 80);
    const id = raw.id || this.generateId(host, name);

    const searchSection  = this.mapComicFSSection(raw.search  || {}, 'search',  mappings, warnings);
    const detailSection  = this.mapComicFSSection(raw.detail  || {}, 'detail',  mappings, warnings);
    const chapterSection = this.mapComicFSSection(raw.chapters|| {}, 'chapters',mappings, warnings);
    const imageSection   = this.mapComicFSSection(raw.images  || {}, 'images',  mappings, warnings);

    // ComicFS ## regex 检测
    if (Object.values(raw.search || {}).some((v: any) => typeof v === 'string' && v.includes('##'))) {
      warnings.push('ComicFS ## regex selectors detected — may need runtime regex resolution');
    }

    const capabilities: SourceCapabilities = {
      search: !!(raw.search), detail: !!(raw.detail),
      chapters: !!(raw.chapters), images: !!(raw.images),
      requiresJs: false, requiresLogin: false, requiresManualAdapter: false,
    };

    return {
      id, name, host, homepage: host || undefined,
      version: '1.0.0', type: 'rule',
      language: raw.language || 'zh',
      search: searchSection, detail: detailSection,
      chapters: chapterSection, images: imageSection,
      headers: this.normalizeHeaders(raw.headers),
      raw: raw, rawRules: raw,
      fieldMappings: mappings, unmappedFields: unmapped,
      warnings, capabilities,
    };
  }

  private mapComicFSSection(raw: any, section: string, mappings: FieldMapping[], warnings: string[]): CanonicalRuleSection {
    if (!raw || typeof raw !== 'object') {
      warnings.push(`${section}: no rule object — mark capability=false`);
      return emptySection();
    }
    const sec: CanonicalRuleSection = {
      url: raw.path || raw.url || '',
      method: raw.method || 'GET',
      responseType: 'html',
      listSelector: raw.item || raw.list || raw.listSelector || '',
      itemSelectors: {},
    };
    for (const f of ['title', 'url', 'cover', 'author', 'latest', 'description', 'status']) {
      if (raw[f]) { sec.itemSelectors[f] = raw[f]; mappings.push({ rawPath: `${section}.${f}`, canonicalField: `${section}.itemSelectors.${f}`, method: 'direct', confidence: 1.0 }); }
    }
    return sec;
  }

  // ============================================================
  // Pipimiao Legacy → Canonical
  // ============================================================

  private normalizePipimiaoLegacy(raw: any): CanonicalSourceDefinition {
    const warnings: string[] = [];
    const host = this.normalizeHost(raw.host || '');
    const name = (raw.name || 'Unknown').slice(0, 80);
    const id = raw.id || this.generateId(host, name);

    const searchSection  = this.buildSection(raw.search,   warnings, 'search');
    const detailSection  = this.buildSection(raw.detail,   warnings, 'detail');
    const chapterSection = this.buildSection(raw.chapters, warnings, 'chapters');
    const imageSection   = this.buildSection(raw.images,   warnings, 'images');

    return {
      id, name, host, homepage: host || undefined,
      version: '1.0.0', type: 'rule',
      language: raw.language || 'zh',
      search: searchSection, detail: detailSection,
      chapters: chapterSection, images: imageSection,
      raw: raw, rawRules: raw,
      fieldMappings: [], unmappedFields: [],
      warnings,
      capabilities: {
        search: !!raw.search, detail: !!raw.detail,
        chapters: !!raw.chapters, images: !!raw.images,
        requiresJs: false, requiresLogin: false, requiresManualAdapter: false,
      },
    };
  }

  private buildSection(raw: any, warnings: string[], label: string): CanonicalRuleSection {
    if (!raw || typeof raw !== 'object') { warnings.push(`${label}: missing — capability=false`); return emptySection(); }
    return {
      url: raw.url || raw.path || '',
      method: raw.method || 'GET',
      responseType: 'html',
      listSelector: raw.listSelector || raw.item || raw.list || '',
      itemSelectors: this.extractItemSelectors(raw),
    };
  }

  // ============================================================
  // MangaSource → Canonical
  // ============================================================

  private normalizeMangaSource(raw: any): CanonicalSourceDefinition {
    const host = this.normalizeHost(raw.host || '');
    const name = (raw.name || 'Unknown').slice(0, 80);
    const id = raw.id || this.generateId(host, name);
    const warnings: string[] = [];

    return {
      id, name, host, homepage: host || undefined,
      version: '1.0.0', type: 'rule',
      language: raw.language || 'zh',
      search: {
        url: raw.search?.url || '', method: raw.search?.method || 'GET',
        responseType: raw.search?.responseType || 'html',
        listSelector: raw.search?.listSelector || raw.search?.item || '',
        itemSelectors: {
          title: raw.search?.titleSelector || '',
          cover: raw.search?.coverSelector || '',
          url: raw.search?.detailUrlSelector || '',
        },
      },
      detail: {
        url: '', method: 'GET', responseType: 'html',
        listSelector: '',
        itemSelectors: {
          title: raw.detail?.titleSelector || '',
          cover: raw.detail?.coverSelector || '',
          author: raw.detail?.authorSelector || '',
          description: raw.detail?.descriptionSelector || '',
        },
      },
      chapters: {
        url: '', method: 'GET', responseType: 'html',
        listSelector: raw.chapters?.listSelector || '',
        itemSelectors: {
          title: raw.chapters?.titleSelector || '',
          url: raw.chapters?.urlSelector || '',
        },
      },
      images: {
        url: raw.images?.url || '', method: 'GET', responseType: 'html',
        listSelector: raw.images?.listSelector || '',
        itemSelectors: { src: raw.images?.srcAttribute || 'src' },
      },
      headers: this.normalizeHeaders(raw.headers),
      timeoutMs: raw.timeoutMs,
      raw: raw, rawRules: raw,
      fieldMappings: [], unmappedFields: [],
      warnings,
      capabilities: {
        search: !!(raw.search), detail: !!(raw.detail),
        chapters: !!(raw.chapters), images: !!(raw.images),
        requiresJs: !!(raw as any).jsRules,
        requiresLogin: false,
        requiresManualAdapter: false,
      },
    };
  }

  // ============================================================
  // JSON Array (best effort, 最低置信度)
  // ============================================================

  private normalizeJsonArrayEntry(raw: any): CanonicalSourceDefinition {
    const host = this.normalizeHost(raw.host || raw.url || '');
    const name = (raw.name || raw.title || raw.bookSourceName || 'Unknown').slice(0, 80);
    const id = raw.id || this.generateId(host, name);
    const warnings = ['Generic JSON array entry — all rules need manual mapping'];
    const unmapped = Object.keys(raw).map(k => ({ rawPath: k, rawValue: raw[k], reason: 'Unrecognized field' }));

    return {
      id, name, host, homepage: host || undefined,
      version: '1.0.0', type: 'rule',
      language: raw.language || 'zh',
      search: emptySection(),
      detail: emptySection(),
      chapters: emptySection(),
      images: emptySection(),
      raw: raw, rawRules: raw,
      fieldMappings: [], unmappedFields: unmapped,
      warnings,
      capabilities: { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: true },
    };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private generateId(host: string, name: string): string {
    return crypto.createHash('sha256').update(`${host}:${name}`, 'utf-8').digest('hex').slice(0, 16);
  }

  private normalizeHost(host: string): string {
    let h = (host || '').trim();
    if (!h) return '';
    if (!h.startsWith('http://') && !h.startsWith('https://')) h = 'https://' + h;
    return h.replace(/\/$/, '');
  }

  private normalizeHeaders(h: any): Record<string, string> | undefined {
    if (!h) return undefined;
    if (typeof h === 'object' && !Array.isArray(h)) return h as Record<string, string>;
    try { return JSON.parse(h as string); } catch { return undefined; }
  }

  private translateLegadoCss(raw: string): string {
    if (!raw) return '';
    let css = raw;
    css = css.replace(/^class\./, '.');
    css = css.replace(/^tag\./, '');
    css = css.replace(/^id\./, '#');
    return css;
  }

  private detectLegadoCapabilities(
    raw: any, search: CanonicalRuleSection, detail: CanonicalRuleSection,
    chapters: CanonicalRuleSection, images: CanonicalRuleSection, warnings: string[],
  ): SourceCapabilities {
    const requiresJs = this.hasJsExpressions(raw);
    const requiresLogin = this.checkLogin(raw);
    if (requiresJs) warnings.push('Contains @js: expressions — requires QuickJS runtime');
    if (requiresLogin) warnings.push('Detected login requirement — may need authentication');

    return {
      search: search.listSelector !== '' || search.url !== '',
      detail: detail.listSelector !== '' || detail.url !== '' || Object.keys(detail.itemSelectors).length > 0,
      chapters: chapters.listSelector !== '' || chapters.url !== '',
      images: images.listSelector !== '' || images.url !== '',
      requiresJs,
      requiresLogin,
      requiresManualAdapter: false,
    };
  }

  private hasJsExpressions(obj: any): boolean {
    const seen = new Set<any>();
    const check = (val: any): boolean => {
      if (val === null || val === undefined || seen.has(val)) return false;
      seen.add(val);
      if (typeof val === 'string') return val.includes('@js:') || val.includes('<js>');
      if (Array.isArray(val)) return val.some(v => check(v));
      if (typeof val === 'object') return Object.values(val).some(v => check(v));
      return false;
    };
    return check(obj);
  }

  private checkLogin(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.needLogin === true || obj.requireLogin === true || obj.login === true) return true;
    if (['loginUrl', 'loginCheck', 'loginAPI'].some(k => typeof obj[k] === 'string' && obj[k].length > 0)) return true;
    if (typeof obj.headers === 'string' && obj.headers.toLowerCase().includes('cookie')) return true;
    return false;
  }

  private extractItemSelectors(raw: any): Record<string, string> {
    const s: Record<string, string> = {};
    const known = ['title','url','cover','author','latest','description',
                   'titleSelector','coverSelector','detailUrlSelector',
                   'latestChapterSelector','statusSelector','src'];
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && !['url','path','method','item','list','listSelector'].includes(k)) s[k] = v;
    }
    return s;
  }
}
