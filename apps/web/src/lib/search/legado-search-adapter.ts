// ============================================================
// Legado / 阅读 3.0 搜索规则适配器
// 从 comicfs source JSON 中提取搜索 URL 并解析选择器
// ============================================================
import type { ComicfsSource } from '@/lib/comicfs/types';

// ---- URL 提取结果 ----
export interface ExtractedSearchConfig {
  urlTemplate: string;
  method: 'GET' | 'POST';
  // CSS selectors
  listSelector: string;
  titleSelector: string;
  coverSelector: string;
  detailUrlSelector: string;
  authorSelector: string;
  latestChapterSelector: string;
  statusSelector: string;
  updateTimeSelector: string;
  // Metadata
  responseType: 'html' | 'json';
  headers: Record<string, string> | undefined;
}

// ---- 错误码 ----
export type SearchUrlError =
  | 'NO_SEARCH_URL'
  | 'URL_BUILD_FAILED'
  | 'UNSUPPORTED_SEARCH_METHOD';

export interface SearchUrlErrorResult {
  ok: false;
  error: SearchUrlError;
  reason: string;
}

export interface SearchUrlOkResult {
  ok: true;
  url: string;
  method: 'GET' | 'POST';
  config: ExtractedSearchConfig;
}

export type SearchUrlResult = SearchUrlOkResult | SearchUrlErrorResult;

// ---- 占位符列表 ----
const KEYWORD_PLACEHOLDERS = [
  /\{\{keyword\}\}/g,
  /\{keyword\}/g,
  /\{\{key\}\}/g,
  /\{key\}/g,
  /searchKey/g,
  /%s/g,
];

// ---- URL 候选字段 (按优先级) ----
// 注意: url 字段在 comicfs 中有歧义 — 可能是搜索 URL 也可能是CSS选择器
// 所以 url 放在最后，并增加 URL 格式检测
const URL_FIELD_CANDIDATES = [
  'path',
  'searchUrl',
  'ruleSearchUrl',
  'url', // 最后尝试 — 需验证格式
];

/**
 * 判断一个字符串是否可能是 URL (而非 CSS 选择器)
 */
function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^\/[^@]/.test(s);
}

const SELECTOR_FIELD_MAP: Record<string, string[]> = {
  listSelector: ['item', 'list', 'ruleSearchList'],
  titleSelector: ['title', 'ruleSearchName'],
  coverSelector: ['cover', 'ruleSearchCoverUrl'],
  detailUrlSelector: ['url', 'detailUrl', 'ruleSearchNoteUrl'],
  authorSelector: ['author', 'ruleSearchAuthor'],
  latestChapterSelector: ['latestChapter', 'ruleSearchLastChapter', 'latest'],
  statusSelector: ['status'],
  updateTimeSelector: ['updateTime'],
};

// ==================== URL 提取 ====================

/**
 * 从多个候选字段中提取搜索 URL 模板
 */
function extractUrlTemplate(source: Record<string, unknown>): string | null {
  const search = (source.search || {}) as Record<string, unknown>;
  const metadata = (source.metadata || {}) as Record<string, unknown>;
  const raw = (metadata.raw || {}) as Record<string, unknown>;

  for (const field of URL_FIELD_CANDIDATES) {
    // 先查 search.xxx
    const fromSearch = search[field];
    if (typeof fromSearch === 'string' && fromSearch.trim()) {
      const val = fromSearch.trim();
      // url 字段有歧义 — 跳过明显是 CSS 选择器的值
      if (field === 'url' && !looksLikeUrl(val)) continue;
      return val;
    }
    // 再查 metadata.raw.xxx (嵌套)
    const fromRaw = raw[field];
    if (typeof fromRaw === 'string' && fromRaw.trim()) {
      const val = fromRaw.trim();
      if (field === 'url' && !looksLikeUrl(val)) continue;
      return val;
    }
  }

  return null;
}

/**
 * 检测搜索是否是 POST 方法
 */
function detectMethod(source: Record<string, unknown>): 'GET' | 'POST' {
  const search = (source.search || {}) as Record<string, unknown>;
  const method = (search.method || '').toString().toUpperCase().trim();
  if (method === 'POST') return 'POST';
  return 'GET';
}

/**
 * 从候选字段中提取 CSS 选择器
 */
function extractSelector(
  source: Record<string, unknown>,
  fieldNames: string[],
): string {
  const search = (source.search || {}) as Record<string, unknown>;
  const metadata = (source.metadata || {}) as Record<string, unknown>;
  const raw = (metadata.raw || {}) as Record<string, unknown>;

  for (const name of fieldNames) {
    const v = search[name] ?? raw[name];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// ==================== URL 构建 ====================

/**
 * 清理 host 字符串
 */
function cleanHost(host: string): string {
  let h = host.trim();
  if (!/^https?:\/\//i.test(h)) {
    h = 'https://' + h;
  }
  // Remove trailing slash
  return h.replace(/\/+$/, '');
}

/**
 * 用关键词替换 URL 模板中的占位符
 */
function applyKeyword(template: string, keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  let url = template;
  let replaced = false;

  for (const re of KEYWORD_PLACEHOLDERS) {
    if (re.test(url)) {
      url = url.replace(re, encoded);
      replaced = true;
      break;
    }
  }

  // 如果没有占位符，追加为 query param
  if (!replaced) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}keyword=${encoded}`;
  }

  return url;
}

/**
 * 确保 URL 是完整的 http/https URL
 * 如果模板是相对路径，基于 host 补全
 */
function resolveFullUrl(template: string, host: string): string | null {
  // 已经是完整 URL
  if (/^https?:\/\//i.test(template)) return template;

  const base = cleanHost(host);

  // 相对路径 (以 / 开头)
  if (template.startsWith('/')) {
    try {
      const origin = base.match(/^(https?:\/\/[^/]+)/)?.[1];
      if (!origin) return null;
      return `${origin}${template}`;
    } catch {
      return null;
    }
  }

  // 其他相对路径 (不以 / 开头)
  return `${base}/${template.replace(/^\//, '')}`;
}

/**
 * 验证 URL 是安全的 http/https URL
 */
function validateUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ==================== 主入口 ====================

/**
 * 从 comicfs source 中提取搜索 URL 和配置
 */
export function adaptLegadoSearch(
  rawSource: Record<string, unknown>,
  keyword: string,
): SearchUrlResult {
  const sourceId = (rawSource.id as string) || 'unknown';
  const host = (rawSource.host as string) || '';

  // 1. 提取 URL 模板
  const template = extractUrlTemplate(rawSource);
  if (!template) {
    return {
      ok: false,
      error: 'NO_SEARCH_URL',
      reason: `Source ${sourceId} has no search URL template`,
    };
  }

  // 2. 方法检测
  const method = detectMethod(rawSource);
  if (method !== 'GET') {
    return {
      ok: false,
      error: 'UNSUPPORTED_SEARCH_METHOD',
      reason: `Source ${sourceId} uses POST search, which is not yet supported`,
    };
  }

  // 3. 替换关键词
  const urlWithKeyword = applyKeyword(template, keyword);

  // 4. 补全 URL
  const finalUrl = resolveFullUrl(urlWithKeyword, host);
  if (!finalUrl || !validateUrl(finalUrl)) {
    return {
      ok: false,
      error: 'URL_BUILD_FAILED',
      reason: `Failed to build valid URL from template: ${template}`,
    };
  }

  // 5. 提取选择器配置
  const responseType =
    (rawSource.search as Record<string, unknown>)?.responseType === 'json' ? 'json' : 'html';

  const rawHeaders = (rawSource as Record<string, unknown>).headers as
    | Record<string, string>
    | undefined;

  const config: ExtractedSearchConfig = {
    urlTemplate: template,
    method,
    listSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.listSelector),
    titleSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.titleSelector),
    coverSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.coverSelector),
    detailUrlSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.detailUrlSelector),
    authorSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.authorSelector),
    latestChapterSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.latestChapterSelector),
    statusSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.statusSelector),
    updateTimeSelector: extractSelector(rawSource, SELECTOR_FIELD_MAP.updateTimeSelector),
    responseType,
    headers: rawHeaders,
  };

  return {
    ok: true,
    url: finalUrl,
    method,
    config,
  };
}

/**
 * 仅构建搜索 URL（简化版，不提取选择器）
 */
export function buildSearchUrlOnly(
  rawSource: Record<string, unknown>,
  keyword: string,
): { ok: true; url: string } | { ok: false; error: SearchUrlError; reason: string } {
  const result = adaptLegadoSearch(rawSource, keyword);
  if (!result.ok) return result;
  return { ok: true, url: result.url };
}
