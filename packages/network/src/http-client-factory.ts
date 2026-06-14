// ============================================================
// packages/network/src/http-client-factory.ts
// Composable factory for building HTTP clients with middleware
// ============================================================

import type { IHttpClient } from './http-client';
import type { CircuitBreakerConfig } from './middleware/circuit-breaker';
import { RetryMiddleware } from './middleware/retry';
import { CircuitBreakerMiddleware } from './middleware/circuit-breaker';
import { HeaderInjectionMiddleware } from './middleware/header-injection';

export interface HttpClientFactoryOptions {
  /** 基础 HTTP 策略 (fetch 或 axios) */
  strategy: IHttpClient;
  /** 重试次数 (0 = 不重试) */
  retries?: number;
  /** 重试基础延迟 ms */
  retryDelayMs?: number;
  /** 熔断器配置 (不传 = 不启用) */
  circuitBreaker?: CircuitBreakerConfig;
  /** 默认注入的请求头 */
  defaultHeaders?: Record<string, string>;
  /** 默认超时 ms */
  defaultTimeout?: number;
}

/**
 * 创建包装了中间件的 HTTP 客户端
 *
 * 管道: HeaderInjection (outer) → CircuitBreaker → Retry → strategy (inner)
 */
export function createHttpClient(
  options: HttpClientFactoryOptions,
): IHttpClient {
  let client = options.strategy;

  // Layer 1 (innermost): Retry
  if (options.retries && options.retries > 0) {
    client = new RetryMiddleware(client, options.retries, options.retryDelayMs);
  }

  // Layer 2: Circuit Breaker
  if (options.circuitBreaker) {
    client = new CircuitBreakerMiddleware(client, options.circuitBreaker);
  }

  // Layer 3 (outermost): Header Injection
  if (options.defaultHeaders || options.defaultTimeout) {
    client = new HeaderInjectionMiddleware(
      client,
      options.defaultHeaders || {},
      options.defaultTimeout,
    );
  }

  return client;
}
