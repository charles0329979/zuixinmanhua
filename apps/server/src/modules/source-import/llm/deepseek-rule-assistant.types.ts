// ============================================================
// apps/server/src/modules/source-import/llm/deepseek-rule-assistant.types.ts
// DeepSeek API 类型定义 — 离线规则字段映射辅助
// ============================================================

/**
 * DeepSeek API 配置 — 全部从环境变量读取，默认关闭
 *
 * SOURCE_IMPORT_LLM_ENABLED=false
 * DEEPSEEK_API_KEY=
 * DEEPSEEK_BASE_URL=https://api.deepseek.com
 * DEEPSEEK_MODEL=deepseek-chat
 */
export interface DeepSeekConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 最大重试次数 */
  maxRetries: number;
  /** 请求超时 (ms) */
  timeoutMs: number;
}

export function loadDeepSeekConfig(): DeepSeekConfig {
  return {
    enabled: process.env.SOURCE_IMPORT_LLM_ENABLED === 'true',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    maxRetries: parseInt(process.env.DEEPSEEK_MAX_RETRIES || '2', 10),
    timeoutMs: parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '30000', 10),
  };
}

/**
 * 发送给 DeepSeek 的请求 — 仅包含最小必要的规则片段
 *
 * 安全约束:
 *   - 不发送用户数据
 *   - 不发送阅读记录
 *   - 不发送鉴权信息/Cookie/Token
 *   - 不发送README/Issue/脚本/不可信说明文本
 *   - 仅发送规则字段路径和值（不含完整原始JSON）
 */
export interface DeepSeekMappingRequest {
  /** 请求的唯一标识 (用于审计日志) */
  requestId: string;
  /** 原始格式类型 */
  sourceFormat: string;
  /** 无法确定性映射的字段列表: 路径 → 原始值 */
  unmappedFields: Record<string, string>;
  /** 已确定性映射的字段 (上下文参考): 原始路径 → 标准字段 */
  mappedFields: Record<string, string>;
  /** 已识别的标准字段列表 */
  knownCanonicalFields: string[];
}

/**
 * DeepSeek API 返回的映射建议 — 固定格式
 *
 * 此输出是"候选映射建议"，不能直接 PROMOTED。
 * 必须再经过静态校验、网络验证、搜索验证、全链路验证。
 */
export interface DeepSeekMappingResponse {
  /** 对整体格式判断的置信度 (0-1) */
  schemaConfidence: number;
  /** 检测到的格式类型 */
  detectedFormat: string;
  /** 字段映射建议列表 */
  fieldMappings: DeepSeekFieldMapping[];
  /** 无法映射的字段 */
  unsupportedFields: DeepSeekUnsupportedField[];
  /** 警告信息 */
  warnings: string[];
  /** 是否需要人工审核 */
  requiresManualReview: boolean;
}

export interface DeepSeekFieldMapping {
  /** 原始字段路径 */
  rawPath: string;
  /** 映射到的标准字段 */
  canonicalField: string;
  /** 映射置信度 (0-1)，< 0.95 必须 MANUAL_REVIEW */
  confidence: number;
  /** 映射理由 */
  reason: string;
}

export interface DeepSeekUnsupportedField {
  /** 原始字段路径 */
  rawPath: string;
  /** 无法映射的原因 */
  reason: string;
}

/**
 * DeepSeek 调用审计日志
 */
export interface DeepSeekAuditLog {
  /** 请求唯一标识 */
  requestId: string;
  /** 时间戳 (ISO 8601) */
  timestamp: string;
  /** 使用的模型 */
  model: string;
  /** 请求的 prompt hash (SHA256) */
  promptHash: string;
  /** 响应的 hash (SHA256) */
  responseHash: string;
  /** DeepSeek 返回的 schema 置信度 */
  schemaConfidence: number;
  /** 总耗时 (ms) */
  durationMs: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 (如有) */
  error?: string;
  /** 映射建议是否被采纳 */
  mappingsAdopted: boolean;
  /** 采纳的映射数量 */
  adoptedCount: number;
}

/**
 * DeepSeek 安全约束 — 禁止发送的内容类型
 */
export const FORBIDDEN_REQUEST_CONTENT = [
  'cookie', 'token', 'authorization', 'api-key', 'apikey',
  'password', 'secret', 'credential', 'signature', 'sign',
  'user_id', 'userid', 'account', 'read_history', 'history',
  'favorite', 'bookmark', 'progress',
] as const;

/** 检查字段名是否包含禁止的内容 */
export function isForbiddenField(fieldPath: string): boolean {
  const lower = fieldPath.toLowerCase();
  return FORBIDDEN_REQUEST_CONTENT.some(f => lower.includes(f));
}
