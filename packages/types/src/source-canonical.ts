// ============================================================
// packages/types/src/source-canonical.ts
// CanonicalSourceDefinition — 标准化中间格式
// 所有外部格式 (Legado/ComicFS/Pipimiao) 先映射到此中间格式
// ============================================================

import type { SourceCapabilities, SourceOrigin } from './source-origin';

/**
 * 标准化规则段 — 四个阶段 (搜索/详情/章节/图片) 的统一结构
 */
export interface CanonicalRuleSection {
  /** 请求 URL 模板 (支持 {{keyword}} 等占位符) */
  url: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST';
  /** 响应类型: html = CSS选择器解析, json = JSON路径解析 */
  responseType: 'html' | 'json';
  /** 列表容器选择器 (CSS selector 或 JSON path) */
  listSelector: string;
  /** 单项字段选择器映射: key → selector */
  itemSelectors: Record<string, string>;
  /** POST 请求体 (仅 method='POST' 时) */
  bodyTemplate?: string;
}

/**
 * 标准化书源定义 — 统一的中间格式
 *
 * 外部格式 (Legado/ComicFS/Pipimiao) 的规则
 * 先转换为 CanonicalSourceDefinition，再由转换器
 * 映射到 MangaSource。
 */
export interface CanonicalSourceDefinition {
  /** 唯一标识 (与 MangaSource.id 对应) */
  id: string;
  /** 书源名称 */
  name: string;
  /** 语义化版本号 (默认 "1.0.0") */
  version?: string;
  /** 书源类型: rule = 规则化源, adapter = 硬编码适配器 (默认 "rule") */
  type?: 'rule' | 'adapter';
  /** 书源首页 URL */
  homepage?: string;
  /** 书源 host URL (API 基地址) */
  host: string;
  /** 书源 base URL (可选，默认等于 host) */
  baseUrl?: string;
  /** 语言代码 */
  language?: string;

  /** 搜索规则 */
  search: CanonicalRuleSection;
  /** 详情规则 */
  detail: CanonicalRuleSection;
  /** 章节规则 */
  chapters: CanonicalRuleSection;
  /** 图片规则 */
  images: CanonicalRuleSection;

  /** 自定义 HTTP 请求头 */
  headers?: Record<string, string>;
  /** 请求超时 (ms) */
  timeoutMs?: number;
  /** 是否允许不安全 SSL */
  allowInsecureSSL?: boolean;

  /** 来源追溯 (导入管道必填，手动创建可选) */
  origin?: SourceOrigin;

  /**
   * 原始规则 (保留完整原始数据，用于调试和审计)
   * 不做任何修改，原样保存
   */
  raw?: unknown;
  /** @deprecated 使用 raw */
  rawRules?: unknown;

  /**
   * 字段映射记录: 原始字段路径 → 标准字段
   */
  fieldMappings: FieldMapping[];

  /**
   * 无法映射的字段 (不静默丢弃)
   */
  unmappedFields: UnmappedField[];

  /**
   * 标准化警告
   */
  warnings: string[];

  /**
   * 检测到的能力标记
   */
  capabilities: SourceCapabilities;
}

/**
 * 字段映射记录
 */
export interface FieldMapping {
  /** 原始规则中的字段路径 (如 "ruleSearch.bookList") */
  rawPath: string;
  /** 映射到的标准字段名 (如 "search.listSelector") */
  canonicalField: string;
  /** 映射方法 */
  method: 'direct' | 'regex' | 'template' | 'llm-assisted';
  /** 置信度 (0-1)，仅 llm-assisted 时可能 < 1 */
  confidence: number;
}

/**
 * 无法映射的字段
 */
export interface UnmappedField {
  /** 原始字段路径 */
  rawPath: string;
  /** 原始值 */
  rawValue: unknown;
  /** 无法映射的原因 */
  reason: string;
}

/**
 * 外部格式类型枚举
 */
export type ExternalFormatType =
  | 'legado-array'        // Legado JSON 数组 [{bookSourceName, bookSourceUrl, ...}]
  | 'legado-single'       // Legado 单源 JSON {bookSourceName, ...}
  | 'comicfs'             // ComicFS 格式
  | 'pipimiao-legacy'     // 皮皮喵旧格式
  | 'ppcat-binary'        // 皮皮喵二进制 store 格式
  | 'json-array'          // 通用 JSON 数组 (需进一步识别)
  | 'manga-source'        // 已是 MangaSource 格式
  | 'unknown';            // 无法识别

/**
 * 格式检测结果
 */
export interface FormatDetectionResult {
  /** 检测到的格式类型 */
  format: ExternalFormatType;
  /** 检测置信度 (0-1) */
  confidence: number;
  /** 检测依据 */
  reason: string;
  /** 是否包含 JS 表达式 */
  hasJsExpressions: boolean;
  /** 是否包含需要登录的标记 */
  requiresLogin: boolean;
  /** 检测到的源数量 (数组格式时) */
  entryCount: number;
}
