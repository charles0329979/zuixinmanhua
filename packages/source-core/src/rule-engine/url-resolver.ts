// ============================================================
// packages/source-core/src/rule-engine/url-resolver.ts
// URL 模板解析 — {{keyword}} 替换 + 相对/绝对 URL 拼接
// ============================================================

const KEYWORD_PLACEHOLDERS = [
  /\{\{keyword\}\}/g,
  /\{keyword\}/g,
  /\{\{key\}\}/g,
  /\{key\}/g,
  /%s/g,
  /searchKey/g,
];

/**
 * 将源路径模板解析为完整搜索 URL
 */
export function resolveSearchUrl(
  pathTemplate: string,
  keyword: string,
  host: string,
): string {
  let url = pathTemplate;
  const encoded = encodeURIComponent(keyword);

  // 替换占位符
  for (const re of KEYWORD_PLACEHOLDERS) {
    if (re.test(url)) {
      url = url.replace(re, encoded);
      break;
    }
  }

  // 如果没有占位符，追加为 query param
  if (!KEYWORD_PLACEHOLDERS.some((re) => re.test(pathTemplate))) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}keyword=${encoded}`;
  }

  // 替换 {{page}}
  url = url.replace(/\{\{page\}\}/g, '1');

  // 绝对 URL → 直接返回
  if (/^https?:\/\//i.test(url)) return url;

  // 协议相对 URL
  if (url.startsWith('//')) return 'https:' + url;

  // 相对路径 → 拼接 host
  const base = host.replace(/\/+$/, '');
  return base + (url.startsWith('/') ? '' : '/') + url;
}

/**
 * 解析相对 URL 为绝对 URL
 */
export function resolveUrl(
  relativeUrl: string,
  baseHost: string,
): string {
  if (!relativeUrl) return '';
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;

  const base = baseHost.replace(/\/+$/, '');

  if (relativeUrl.startsWith('//')) {
    const proto = base.startsWith('https') ? 'https' : 'http';
    return `${proto}:${relativeUrl}`;
  }

  if (relativeUrl.startsWith('/')) {
    const origin =
      base.match(/^(https?:\/\/[^/]+)/)?.[1] || base;
    return `${origin}${relativeUrl}`;
  }

  const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
  return `${baseDir}${relativeUrl}`;
}

/**
 * 清理 host 字符串（移除 # 注释后缀）
 */
export function cleanHost(rawHost: string): string {
  return rawHost.split('#')[0].replace(/\/+$/, '');
}
