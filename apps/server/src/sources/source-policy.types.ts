/**
 * SourcePolicy — 书源策略配置
 * 控制每个书源的运行模式、请求行为、熔断参数
 */

export type SourceMode = 'server-parser' | 'client-parser' | 'external-only';

export interface SourcePolicy {
  /** 运行模式 */
  mode: SourceMode;
  /** 最大并发请求数 */
  maxConcurrentRequests: number;
  /** 单次请求超时 (ms) */
  requestTimeoutMs: number;
  /** 熔断冷却时间 (ms)，默认 24h */
  cooldownAfterBlockedMs: number;
  /** 每次加载的最大图片数 */
  maxImagesPerBatch: number;
}

export const DEFAULT_SOURCE_POLICY: SourcePolicy = {
  mode: 'server-parser',
  maxConcurrentRequests: 1,
  requestTimeoutMs: 5000,
  cooldownAfterBlockedMs: 86_400_000, // 24h
  maxImagesPerBatch: 6,
};

export type SourceHealthStatus = 'healthy' | 'degraded' | 'blocked' | 'disabled' | 'unknown';

export interface SourceHealth {
  sourceId: string;
  status: SourceHealthStatus;
  consecutiveFailures: number;
  blockedUntil?: string;
  lastError?: string;
  lastCheckedAt?: string;
}

/** 熔断错误 — 检测到反爬时抛出 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public sourceId: string,
    public readonly triggerType: 'http_403' | 'http_429' | 'captcha' | 'redirect' | 'blocked_pattern',
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/** 检测响应是否包含反爬特征 */
export function detectBlockPattern(html: string, redirectedTo?: string): CircuitBreakerError | null {
  // 百度重定向
  if (html.includes('baidu.com') || html.includes('百度一下')) {
    return new CircuitBreakerError('检测到重定向至百度，疑似反爬拦截', '', 'redirect');
  }
  // 验证码页面
  if (html.includes('验证码') || html.includes('captcha') || html.includes('请证明') || html.includes('人机验证')) {
    return new CircuitBreakerError('检测到验证码页面', '', 'captcha');
  }
  // Cloudflare 拦截
  if (html.includes('Just a moment') || html.includes('cf-browser-verify') || html.includes('_cf_chl_opt')) {
    return new CircuitBreakerError('检测到 Cloudflare 拦截', '', 'blocked_pattern');
  }
  // 通用拦截
  if (html.includes('请求过于频繁') || html.includes('rate limit') || html.includes('访问过于频繁')) {
    return new CircuitBreakerError('检测到频率限制', '', 'blocked_pattern');
  }
  return null;
}
