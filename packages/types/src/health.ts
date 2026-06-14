// ============================================================
// packages/types/src/health.ts
// 书源健康检查 + 熔断相关类型
// ============================================================

// ---- 健康状态 ----

export type SourceHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'blocked'
  | 'disabled'
  | 'unknown';

export interface SourceHealth {
  sourceId: string;
  status: SourceHealthStatus;
  consecutiveFailures: number;
  blockedUntil?: string;
  lastError?: string;
  lastCheckedAt?: string;
}

// ---- 健康检查层级 ----

export type HealthCheckType = 'homepage' | 'search' | 'detail' | 'chapter' | 'image';

export interface HealthCheckResult {
  sourceId: string;
  checkType: HealthCheckType;
  ok: boolean;
  error?: string;
  responseTimeMs: number;
  checkedAt: string;
}

// ---- 熔断器 ----

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public sourceId: string,
    public readonly triggerType:
      | 'http_403'
      | 'http_429'
      | 'captcha'
      | 'redirect'
      | 'blocked_pattern',
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/** 检测响应内容是否包含反爬特征 */
export function detectBlockPattern(
  html: string,
  redirectedTo?: string,
): CircuitBreakerError | null {
  // 百度重定向
  if (html.includes('baidu.com') || html.includes('百度一下')) {
    return new CircuitBreakerError(
      '检测到重定向至百度，疑似反爬拦截',
      '',
      'redirect',
    );
  }
  // 验证码
  if (
    html.includes('验证码') ||
    html.includes('captcha') ||
    html.includes('请证明') ||
    html.includes('人机验证')
  ) {
    return new CircuitBreakerError('检测到验证码页面', '', 'captcha');
  }
  // Cloudflare
  if (
    html.includes('Just a moment') ||
    html.includes('cf-browser-verify') ||
    html.includes('_cf_chl_opt')
  ) {
    return new CircuitBreakerError('检测到 Cloudflare 拦截', '', 'blocked_pattern');
  }
  // 频率限制
  if (
    html.includes('请求过于频繁') ||
    html.includes('rate limit') ||
    html.includes('访问过于频繁')
  ) {
    return new CircuitBreakerError('检测到频率限制', '', 'blocked_pattern');
  }
  return null;
}
