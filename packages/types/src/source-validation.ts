// ============================================================
// packages/types/src/source-validation.ts
// SourceValidationResult, SourceHealthScore, ImportedSourceCandidate
// ============================================================

import type { SourceOrigin, SourceCapabilities, SourceLifecycleStatus } from './source-origin';
import type { CanonicalSourceDefinition } from './source-canonical';

/**
 * 书源多层验证结果
 */
export interface SourceValidationResult {
  /** 被验证的源 ID (默认取 candidate.id) */
  sourceId?: string;
  /** Layer 0: 静态规则校验是否通过 */
  staticPassed: boolean;
  /** Layer 1: 网络可达性是否通过 */
  networkPassed: boolean;
  /** Layer 2: 搜索功能是否通过 */
  searchPassed: boolean;
  /** Layer 3: 详情页是否可解析 */
  detailPassed: boolean;
  /** Layer 3: 章节列表是否可解析 */
  chaptersPassed: boolean;
  /** Layer 3: 图片 URL 是否可提取 */
  imagesPassed: boolean;
  /** Layer 3: 图片是否可通过 ProxyModule 加载 */
  proxyPassed: boolean;

  /** 测试用的搜索关键词 */
  testKeyword?: string;
  /** 搜索结果数 */
  resultCount?: number;
  /** 搜索到的第一个漫画标题 */
  firstComicTitle?: string;
  /** 第一个章节标题 */
  firstChapterTitle?: string;
  /** 第一张图片 URL */
  firstImageUrl?: string;

  /** 平均响应延迟 (ms) */
  latencyMs?: number;
  /** 失败错误码 */
  errorCode?: string;
  /** 失败错误信息 */
  errorMessage?: string;
  /** 验证时间 (ISO 8601) */
  testedAt: string;

  /** 各层详细日志 (可选) */
  layerDetails?: {
    static?: StaticLintDetail;
    network?: NetworkCheckDetail;
    search?: SearchCheckDetail;
    chain?: ChainCheckDetail;
  };
}

/** Layer 0 静态校验详情 */
export interface StaticLintDetail {
  checks: { name: string; passed: boolean; message?: string }[];
  warnings: string[];
}

/** Layer 1 网络检查详情 */
export interface NetworkCheckDetail {
  dnsResolved: boolean;
  dnsMs: number;
  tcpConnected: boolean;
  tcpMs: number;
  sslOk: boolean;
  sslMs: number;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  redirectCount: number;
  blockedDetected: boolean;
  blockReason?: string;
  totalMs: number;
}

/** Layer 2 搜索检查详情 */
export interface SearchCheckDetail {
  keywords: string[];
  resultsPerKeyword: Record<string, number>;
  /** 搜索到的第一个结果的标题（用于验证详情页） */
  firstResultTitle?: string;
  firstResultUrl?: string;
  totalMs: number;
}

/** Layer 3 全链路检查详情 */
export interface ChainCheckDetail {
  detailUrl: string;
  detailTitleMatch: boolean;
  chapterCount: number;
  firstChapterTitle?: string;
  imageCount: number;
  firstImageUrl?: string;
  proxyImageStatus?: number;
  proxyImageContentType?: string;
  totalMs: number;
}

/**
 * 书源健康评分 (0-100)
 */
export interface SourceHealthScore {
  /** 被评分的源 ID (默认取 candidate.id) */
  sourceId?: string;
  /** 总分 (0-100) */
  total: number;
  /** 静态规则完整性得分 (0-15) */
  staticScore: number;
  /** 网络可达性得分 (0-15) */
  networkScore: number;
  /** 搜索有效性得分 (0-20) */
  searchScore: number;
  /** 详情页有效性得分 (0-15) */
  detailScore: number;
  /** 章节有效性得分 (0-15) */
  chapterScore: number;
  /** 图片链路有效性得分 (0-15) */
  imageScore: number;
  /** 响应速度得分 (0-5) */
  latencyScore: number;
  /** 推荐动作 */
  recommendation: 'PROMOTE' | 'KEEP_CANDIDATE' | 'QUARANTINE' | 'MANUAL_REVIEW';
}

/**
 * 导入候选书源 — 贯穿整个导入管道的统一数据模型
 */
export interface ImportedSourceCandidate {
  /** 唯一标识 (与 MangaSource.id 一致) */
  id: string;
  /** 书源名称 */
  name: string;
  /** 标准化后的完整书源定义 (V4) */
  source?: CanonicalSourceDefinition;
  /** 标准化后的 MangaSource (向后兼容) */
  normalizedSource?: unknown;
  /** 来源追溯 */
  origin: SourceOrigin;
  /** 能力标记 */
  capabilities: SourceCapabilities;
  /** 当前生命周期状态 */
  lifecycleStatus: SourceLifecycleStatus;
  /** 验证结果 (仅在验证后有值) */
  validation?: SourceValidationResult;
  /** 健康评分 (仅在验证后有值) */
  health?: SourceHealthScore;
  /** 标准化过程中产生的警告 */
  conversionWarnings: string[];
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 最后更新时间 (ISO 8601) */
  updatedAt: string;
}

/**
 * 导入运行报告
 */
export interface ImportRunReport {
  runId: string;
  repositoryId: string;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  startedAt: string;
  completedAt: string;

  filesScanned: number;
  sourcesDiscovered: number;
  sourcesParsed: number;
  staticRejected: number;
  networkFailed: number;
  searchFailed: number;
  fullChainPassed: number;
  promoted: number;
  quarantine: number;
  manualReview: number;

  errors: ImportRunErrorSummary[];
  candidateReports: string[];
  totalDurationMs: number;
}

export interface ImportRunErrorSummary {
  stage: string;
  count: number;
  sample: string;
}

/**
 * 仓库配置
 */
export interface RepositoryConfig {
  id: string;
  type: 'github';
  url: string;
  branch: string;
  enabled: boolean;
  /** 预期格式 (自动检测或手动指定) */
  format?: string;
  /** 源文件在仓库中的 glob 路径 */
  sourcePath?: string;
}
