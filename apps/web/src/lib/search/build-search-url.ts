// ============================================================
// 搜索 URL 构造器 — 兼容多种 comicfs 源字段命名
// 委托给 legado-search-adapter 处理所有 Legado 格式
// ============================================================
import { isSafeUrl } from './safe-url';
import { cleanHost } from '@/lib/manga-search/url-resolver';

// ---- 占位符 ----
const PLACEHOLDERS = [
  /\{\{keyword\}\}/g,
  /\{keyword\}/g,
  /\{\{key\}\}/g,
  /\{key\}/g,
  /searchKey/g,
  /%s/g,
];

// ---- URL 候选字段 ----
const URL_CANDIDATES = [
  'path',
  'url',
  'searchUrl',
  'ruleSearchUrl',
];

/**
 * 从 source 对象中提取搜索 URL 模板
 * 兼容 comicfs 主字段 + metadata.raw 嵌套字段
 */
export function extractSearchUrlTemplate(
  source: Record<string, unknown>,
): string | null {
  const search = (source.search || {}) as Record<string, unknown>;
  const metadata = (source.metadata || {}) as Record<string, unknown>;
  const raw = (metadata.raw || {}) as Record<string, unknown>;

  for (const field of URL_CANDIDATES) {
    const fromSearch = search[field];
    if (typeof fromSearch === 'string' && fromSearch.trim()) {
      return fromSearch.trim();
    }
    const fromRaw = raw[field];
    if (typeof fromRaw === 'string' && fromRaw.trim()) {
      return fromRaw.trim();
    }
  }

  return null;
}

/**
 * 用关键词替换 URL 模板占位符
 * 返回完整 http/https URL，失败返回 null
 */
export function buildSearchUrl(
  template: string,
  keyword: string,
  host: string,
): string | null {
  const clean = cleanHost(host);
  let url = template;
  const encoded = encodeURIComponent(keyword);
  let replaced = false;

  for (const re of PLACEHOLDERS) {
    if (re.test(url)) {
      url = url.replace(re, encoded);
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}keyword=${encoded}`;
  }

  // 补全为完整 URL
  if (!/^https?:\/\//i.test(url)) {
    const base = clean.replace(/\/+$/, '');
    if (url.startsWith('/')) {
      const origin = base.match(/^(https?:\/\/[^/]+)/)?.[1] || base;
      url = `${origin}${url}`;
    } else {
      url = `${base}/${url.replace(/^\//, '')}`;
    }
  }

  return isSafeUrl(url) ? url : null;
}
