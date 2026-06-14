// ============================================================
// packages/network/src/index.ts
// Barrel export — Unified HTTP Client
// ============================================================

export type { IHttpClient, HttpRequestConfig, HttpResponse } from './http-client';
export type { CircuitBreakerConfig } from './middleware/circuit-breaker';
export type { HttpClientFactoryOptions } from './http-client-factory';

export { FetchHttpClient } from './strategies/fetch-strategy';
export { AxiosHttpClient } from './strategies/axios-strategy';
export { RetryMiddleware } from './middleware/retry';
export { CircuitBreakerMiddleware } from './middleware/circuit-breaker';
export { HeaderInjectionMiddleware } from './middleware/header-injection';
export { createHttpClient } from './http-client-factory';
