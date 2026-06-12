// ============================================================
// URL 安全校验
// ============================================================

const BLOCKED_PROTOCOLS = ['javascript:', 'file:', 'data:', 'ftp:', 'vbscript:'];

const BLOCKED_HOST_PATTERNS = [
  /^127\.\d+\.\d+\.\d+/,
  /^10\.\d+\.\d+\.\d+/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
  /^192\.168\.\d+\.\d+/,
  /^0\.0\.0\.0$/,
  /^localhost$/i,
  /^\[::1\]$/,
];

/**
 * 检查 URL 是否安全可用
 */
export function isSafeUrl(url: string): boolean {
  if (!url) return false;

  const lower = url.toLowerCase().trim();

  // 禁止危险协议
  for (const proto of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(proto)) return false;
  }

  // 必须 http/https
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return false;
  }

  // 禁止内网地址
  try {
    const parsed = new URL(url);
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(parsed.hostname)) return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * 获取 URL 的 hostname
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * 获取 URL 的 origin
 */
export function getOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}
