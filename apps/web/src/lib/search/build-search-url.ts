// ============================================================
// 搜索 URL 构造器 — 兼容多种 comicfs 源字段命名
// ============================================================
import { isSafeUrl } from './safe-url';
import { cleanHost } from '@/lib/manga-search/url-resolver';

const PLACEHOLDERS = [
  /\{\{keyword\}\}/g, /\{keyword\}/g,
  /\{\{key\}\}/g, /\{key\}/g,
  /searchKey/g,
];

export function extractSearchUrlTemplate(source: Record<string, unknown>): string | null {
  const search = (source.search || {}) as Record<string, unknown>;
  const metadata = (source.metadata || {}) as Record<string, unknown>;
  const raw = (metadata.raw || {}) as Record<string, unknown>;
  const candidates = [search?.path, search?.url, search?.searchUrl, search?.ruleSearchUrl, raw?.searchUrl, raw?.ruleSearchUrl];
  for (const c of candidates) { if (typeof c === 'string' && c.trim()) return c.trim(); }
  return null;
}

export function buildSearchUrl(template: string, keyword: string, host: string): string | null {
  const clean = cleanHost(host);
  let url = template;
  const encoded = encodeURIComponent(keyword);
  let replaced = false;
  for (const re of PLACEHOLDERS) {
    if (re.test(url)) { url = url.replace(re, encoded); replaced = true; }
  }
  if (!replaced) {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      u.search += (u.search ? '&' : '?') + `keyword=${encoded}`;
      url = u.toString();
    } catch { url += (url.includes('?') ? '&' : '?') + `keyword=${encoded}`; }
  }
  if (!/^https?:\/\//i.test(url)) {
    const base = clean.replace(/\/+$/, '');
    if (url.startsWith('/')) {
      const origin = base.match(/^(https?:\/\/[^/]+)/)?.[1] || base;
      url = `${origin}${url}`;
    } else { url = `${base}/${url.replace(/^\//, '')}`; }
  }
  return isSafeUrl(url) ? url : null;
}
