// ============================================================
// HTML 请求器 — 安全 header 白名单 + 结构化错误
// ============================================================
import { isSafeUrl } from './safe-url';

// ---- 允许传入的 header key 白名单 ----
const ALLOWED_HEADER_KEYS = new Set([
  'user-agent',
  'accept',
  'accept-language',
  'referer',
  'cookie',
]);

/** 默认请求头 (纯 ASCII，不含中文) */
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const HTTP_TIMEOUT_MS = 8000;

// ---- 错误码 ----
export type FetchErrorCode =
  | 'DNS_FAILED'
  | 'TLS_FAILED'
  | 'TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'HTTP_403'
  | 'HTTP_404'
  | 'HTTP_5XX'
  | 'HTTP_429'
  | 'HTTP_OTHER'
  | 'INVALID_CONTENT_TYPE'
  | 'EMPTY_HTML'
  | 'UNSAFE_URL'
  | 'FETCH_FAILED';

export interface FetchErrorDetail {
  code: FetchErrorCode;
  message: string;
  cause?: string;
  url?: string;
  httpStatus?: number;
}

export interface FetchHtmlOk {
  ok: true;
  body: string;
  contentType: string;
  finalUrl: string;
  httpStatus: number;
}

export interface FetchHtmlErr {
  ok: false;
  error: FetchErrorDetail;
}

export type FetchHtmlOutcome = FetchHtmlOk | FetchHtmlErr;

function makeErr(
  code: FetchErrorCode,
  message: string,
  opts?: { cause?: string; url?: string; httpStatus?: number },
): FetchHtmlErr {
  return { ok: false, error: { code, message, ...opts } };
}

// ==================== Header 净化 ====================

/**
 * 净化单个 header value
 * - 移除 \r \n (防止 header injection)
 * - 移除所有非 ASCII 字符 (防止 ByteString 错误)
 * - 空字符串/纯空白 → 丢弃
 */
function sanitizeHeaderValue(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  let v = value.replace(/\r/g, '').replace(/\n/g, '');
  // 移除非 ASCII 字符 (U+0000–U+007F 保留)
  v = v.replace(/[^\x00-\x7F]/g, '');
  v = v.trim();
  return v.length > 0 ? v : null;
}

/**
 * 合并用户提供的额外 headers (严格白名单 + 净化)
 * @param extraHeaders 原始 headers (来自 source 配置)
 * @returns 净化后的对象，仅包含白名单 key
 */
function buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers = { ...DEFAULT_HEADERS };

  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [key, rawValue] of Object.entries(extraHeaders)) {
      const keyLower = key.toLowerCase().trim();
      if (!ALLOWED_HEADER_KEYS.has(keyLower)) continue;
      if (typeof rawValue !== 'string') continue;

      const cleaned = sanitizeHeaderValue(rawValue);
      if (cleaned === null) continue;

      // 用原始 key 保留大小写
      headers[key] = cleaned;
    }
  }

  return headers;
}

// ==================== 主函数 ====================

export async function fetchHtml(
  searchUrl: string,
  refererHost: string,
  extraHeaders?: Record<string, string>,
): Promise<FetchHtmlOutcome> {
  // 安全校验
  if (!isSafeUrl(searchUrl)) {
    return makeErr('UNSAFE_URL', 'Blocked protocol or internal host', { url: searchUrl });
  }

  const headers = buildHeaders(extraHeaders);
  // refererHost 也需要净化
  const referer = sanitizeHeaderValue(refererHost) || refererHost;
  if (referer) {
    headers['Referer'] = referer;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers,
    });

    const httpStatus = response.status;

    if (httpStatus === 403) {
      return makeErr('HTTP_403', 'Access forbidden', { httpStatus, url: searchUrl });
    }
    if (httpStatus === 404) {
      return makeErr('HTTP_404', 'Page not found', { httpStatus, url: searchUrl });
    }
    if (httpStatus === 429) {
      return makeErr('HTTP_429', 'Rate limited', { httpStatus, url: searchUrl });
    }
    if (httpStatus >= 500) {
      return makeErr('HTTP_5XX', `Server error ${httpStatus}`, { httpStatus, url: searchUrl });
    }
    if (httpStatus >= 400) {
      return makeErr('HTTP_OTHER', `HTTP ${httpStatus}`, { httpStatus, url: searchUrl });
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/json') &&
      !contentType.includes('text/plain')
    ) {
      return makeErr('INVALID_CONTENT_TYPE', `Unexpected content-type: ${contentType}`, { url: searchUrl });
    }

    const body = await response.text();
    if (!body || body.length < 100) {
      return makeErr('EMPTY_HTML', 'Response body too small or empty', { httpStatus, url: searchUrl });
    }

    return {
      ok: true,
      body,
      contentType,
      finalUrl: response.url || searchUrl,
      httpStatus,
    };
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return makeErr('TIMEOUT', 'Request aborted after 8s', { url: searchUrl });
    }

    const msg = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error
        ? ((err as Error & { cause?: { code?: string } }).cause)
        : undefined;
    const causeCode =
      cause && typeof cause === 'object' && 'code' in cause
        ? String((cause as { code: string }).code)
        : '';

    // 分类底层错误
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || causeCode === 'ENOTFOUND') {
      return makeErr('DNS_FAILED', 'DNS resolution failed', { cause: msg, url: searchUrl });
    }
    if (msg.includes('ECONNREFUSED') || causeCode === 'ECONNREFUSED') {
      return makeErr('CONNECTION_REFUSED', 'Connection refused', { cause: msg, url: searchUrl });
    }
    if (
      msg.includes('CERT_') ||
      msg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
      msg.includes('SSL') ||
      msg.includes('TLS')
    ) {
      return makeErr('TLS_FAILED', 'TLS/SSL handshake failed', { cause: msg, url: searchUrl });
    }

    return makeErr('FETCH_FAILED', msg, { cause: msg, url: searchUrl });
  } finally {
    clearTimeout(timer);
  }
}
