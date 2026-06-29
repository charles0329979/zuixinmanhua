// ============================================================
// source-platform/runtime/source-runtime-error.ts
// Runtime 层统一错误类型
// ============================================================

/** 驱动未找到 */
export class DriverNotFoundError extends Error {
  public readonly code = 'DRIVER_NOT_FOUND';
  constructor(public readonly driverId: string) {
    super(`Source driver not found: ${driverId}`);
    this.name = 'DriverNotFoundError';
  }
}

/** 搜索超时 */
export class SearchTimeoutError extends Error {
  public readonly code = 'SEARCH_TIMEOUT';
  constructor(driverId: string, timeoutMs: number) {
    super(`Search timeout for ${driverId} after ${timeoutMs}ms`);
    this.name = 'SearchTimeoutError';
  }
}

/** 能力不支持 */
export class CapabilityNotSupportedError extends Error {
  public readonly code = 'CAPABILITY_NOT_SUPPORTED';
  constructor(driverId: string, capability: string) {
    super(`Source ${driverId} does not support ${capability}`);
    this.name = 'CapabilityNotSupportedError';
  }
}

/** 执行错误（通用） */
export class RuntimeExecutionError extends Error {
  public readonly code = 'RUNTIME_EXECUTION_ERROR';
  constructor(driverId: string, operation: string, cause: string) {
    super(`Execution failed for ${driverId}/${operation}: ${cause}`);
    this.name = 'RuntimeExecutionError';
  }
}
