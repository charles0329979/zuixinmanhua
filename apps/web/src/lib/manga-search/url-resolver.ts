// ============================================================
// URL 解析器 — 处理 {{keyword}} 模板 + 相对/绝对 URL
// ============================================================

const encoder = typeof encodeURIComponent === 'function'
  ? encodeURIComponent
  : (s: string) => s;

/**
 * 将源路径模板解析为完整搜索 URL
 * 支持：
 *   - {{keyword}} 替换
 *   - 相对路径 → 绝对 URL（相对于源 host）
 *   - GBK 编码（如果模板中包含 {{keyword.gbk}}）
 */
export function resolveSearchUrl(
  pathTemplate: string,
  keyword: string,
  host: string,
): string {
  let url = pathTemplate;

  // {{keyword}} — UTF-8 编码
  url = url.replace(/\{\{keyword\}\}/g, encoder(keyword));

  // {{keyword.raw}} — 不编码（某些源需要原始中文）
  url = url.replace(/\{\{keyword\.raw\}\}/g, keyword);

  // 如果是相对路径，拼接 host
  if (url.startsWith('/')) {
    const base = host.replace(/\/+$/, '');
    url = `${base}${url}`;
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // 可能是像 "search?q=xxx" 这样的路径
    const base = host.replace(/\/+$/, '');
    url = `${base}/${url.replace(/^\//, '')}`;
  }

  return url;
}

/**
 * 解析相对 URL 为绝对 URL
 */
export function resolveUrl(relativeUrl: string, baseHost: string): string {
  if (!relativeUrl) return '';

  // 已经是绝对 URL
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;

  const base = baseHost.replace(/\/+$/, '');

  // 协议相对 URL (//example.com/path)
  if (relativeUrl.startsWith('//')) {
    const proto = base.startsWith('https') ? 'https' : 'http';
    return `${proto}:${relativeUrl}`;
  }

  // 绝对路径
  if (relativeUrl.startsWith('/')) {
    const origin = base.match(/^(https?:\/\/[^/]+)/)?.[1] || base;
    return `${origin}${relativeUrl}`;
  }

  // 相对路径
  const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
  return `${baseDir}${relativeUrl}`;
}

/**
 * 清理 host 字符串（有些源 host 包含 # 分隔的注释）
 * 如 "https://www.manmanapp.com#yc1101" → "https://www.manmanapp.com"
 */
export function cleanHost(rawHost: string): string {
  return rawHost.split('#')[0].replace(/\/+$/, '');
}
