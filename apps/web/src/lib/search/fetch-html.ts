// ============================================================
// HTML 请求器 — 服务端 fetch 漫画站（增强错误码）
// ============================================================
import { isSafeUrl } from './safe-url';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const HTTP_TIMEOUT_MS = 8000;

// ---- 错误码 ----
export type FetchErrorCode =
  | 'DNS_FAILED' | 'TLS_FAILED' | 'TIMEOUT' | 'CONNECTION_REFUSED'
  | 'HTTP_403' | 'HTTP_404' | 'HTTP_5XX' | 'HTTP_429' | 'HTTP_OTHER'
  | 'INVALID_CONTENT_TYPE' | 'EMPTY_HTML' | 'FETCH_FAILED'
  | 'UNSAFE_URL';

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

function error(code: FetchErrorCode, message: string, opts?: { cause?: string; url?: string; httpStatus?: number }): FetchHtmlErr {
  return { ok: false, error: { code, message, ...opts } };
}

// ---- 主函数 ----

export async function fetchHtml(searchUrl: string, refererHost: string): Promise<FetchHtmlOutcome> {
  if (!isSafeUrl(searchUrl)) {
    return error('UNSAFE_URL', 'Blocked protocol or internal host', { url: searchUrl });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { ...HEADERS, Referer: refererHost },
    });

    const httpStatus = response.status;

    if (httpStatus === 403) {
      return error('HTTP_403', 'Access forbidden', { httpStatus, url: searchUrl });
    }
    if (httpStatus === 404) {
      return error('HTTP_404', 'Page not found', { httpStatus, url: searchUrl });
    }
    if (httpStatus === 429) {
      return error('HTTP_429', 'Rate limited', { httpStatus, url: searchUrl });
    }
    if (httpStatus >= 500) {
      return error('HTTP_5XX', `Server error ${httpStatus}`, { httpStatus, url: searchUrl });
    }
    if (httpStatus >= 400) {
      return error('HTTP_OTHER', `HTTP ${httpStatus}`, { httpStatus, url: searchUrl });
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    if (!contentType.includes('text/html') && !contentType.includes('application/json') && !contentType.includes('text/plain')) {
      return error('INVALID_CONTENT_TYPE', `Unexpected content-type: ${contentType}`, { url: searchUrl });
    }

    const body = await response.text();
    if (!body || body.length < 100) {
      return error('EMPTY_HTML', 'Response body too small or empty', { httpStatus, url: searchUrl });
    }

    return { ok: true, body, contentType, finalUrl: response.url || searchUrl, httpStatus };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return error('TIMEOUT', 'Request aborted after 8s', { url: searchUrl });
    }
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause : undefined;
    const causeCode = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code: string }).code) : '';

    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || causeCode === 'ENOTFOUND') {
      return error('DNS_FAILED', 'DNS resolution failed', { cause: msg, url: searchUrl });
    }
    if (msg.includes('ECONNREFUSED') || causeCode === 'ECONNREFUSED') {
      return error('CONNECTION_REFUSED', 'Connection refused', { cause: msg, url: searchUrl });
    }
    if (msg.includes('CERT_') || msg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') || msg.includes('SSL') || msg.includes('TLS')) {
      return error('TLS_FAILED', 'TLS/SSL handshake failed', { cause: msg, url: searchUrl });
    }
    return error('FETCH_FAILED', msg, { cause: msg, url: searchUrl });
  } finally {
    clearTimeout(timer);
  }
}
